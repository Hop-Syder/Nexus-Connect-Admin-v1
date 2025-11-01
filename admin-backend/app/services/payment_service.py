import logging
import requests
from typing import Dict, Optional
from datetime import datetime

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class MonerooPaymentService:
    """Service de paiement Moneroo.io"""
    
    def __init__(self):
        self.base_url = settings.MONEROO_BASE_URL
        self.api_key = settings.MONEROO_API_KEY
        self.secret_key = settings.MONEROO_SECRET_KEY
        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
    
    def create_payment_link(
        self,
        amount: float,
        currency: str = 'XOF',
        description: str = '',
        customer_email: str = '',
        customer_name: str = '',
        metadata: Optional[Dict] = None
    ) -> Dict:
        """Créer un lien de paiement Moneroo
        
        Args:
            amount: Montant en devise locale
            currency: Code devise (XOF, USD, EUR)
            description: Description du paiement
            customer_email: Email client
            customer_name: Nom client
            metadata: Métadonnées personnalisées
        
        Returns:
            Dict avec payment_link, payment_id
        """
        if not self.api_key:
            logger.warning("Moneroo not configured")
            return {'error': 'Payment service not configured'}
        
        try:
            payload = {
                'amount': int(amount),  # Moneroo attend des centimes
                'currency': currency,
                'description': description,
                'customer': {
                    'email': customer_email,
                    'name': customer_name
                },
                'metadata': metadata or {},
                'return_url': f'https://admin-connect.nexus-partners.xyz/payments/success',
                'cancel_url': f'https://admin-connect.nexus-partners.xyz/payments/cancel'
            }
            
            response = requests.post(
                f"{self.base_url}/v1/payments/initialize",
                json=payload,
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'payment_link': data.get('payment_url'),
                    'payment_id': data.get('payment_id'),
                    'reference': data.get('reference')
                }
            else:
                logger.error(f"Moneroo payment link creation failed: {response.text}")
                return {'error': 'Payment link creation failed'}
        
        except Exception as e:
            logger.error(f"Moneroo payment error: {str(e)}")
            return {'error': str(e)}
    
    def verify_payment(self, payment_id: str) -> Dict:
        """Vérifier le statut d'un paiement
        
        Args:
            payment_id: ID du paiement Moneroo
        
        Returns:
            Dict avec status, amount, etc.
        """
        if not self.api_key:
            return {'error': 'Payment service not configured'}
        
        try:
            response = requests.get(
                f"{self.base_url}/v1/payments/{payment_id}",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'status': data.get('status'),  # 'pending', 'success', 'failed'
                    'amount': data.get('amount'),
                    'currency': data.get('currency'),
                    'reference': data.get('reference'),
                    'paid_at': data.get('paid_at')
                }
            else:
                logger.error(f"Moneroo payment verification failed: {response.text}")
                return {'error': 'Payment verification failed'}
        
        except Exception as e:
            logger.error(f"Moneroo verification error: {str(e)}")
            return {'error': str(e)}
    
    def verify_webhook(self, payload: Dict, signature: str) -> bool:
        """Vérifier la signature d'un webhook Moneroo
        
        Args:
            payload: Payload du webhook
            signature: Signature reçue dans l'header
        
        Returns:
            bool: True si signature valide
        """
        import hmac
        import hashlib
        import json
        
        if not self.secret_key:
            return False
        
        try:
            # Créer la signature attendue
            payload_str = json.dumps(payload, separators=(',', ':'))
            expected_signature = hmac.new(
                self.secret_key.encode(),
                payload_str.encode(),
                hashlib.sha256
            ).hexdigest()
            
            return hmac.compare_digest(signature, expected_signature)
        
        except Exception as e:
            logger.error(f"Webhook verification error: {str(e)}")
            return False

# Singleton instance
_moneroo_service = None

def get_payment_service() -> MonerooPaymentService:
    """Get Moneroo payment service instance"""
    global _moneroo_service
    if _moneroo_service is None:
        _moneroo_service = MonerooPaymentService()
    return _moneroo_service

# Helper functions
def process_payment(amount: float, user_id: str, plan_code: str) -> Dict:
    """Traiter un paiement d'abonnement"""
    service = get_payment_service()
    
    # Dans une vraie implémentation, récupérer user email/name depuis DB
    return service.create_payment_link(
        amount=amount,
        currency='XOF',
        description=f'Abonnement {plan_code}',
        customer_email=f'user-{user_id}@example.com',
        customer_name='User Name',
        metadata={
            'user_id': user_id,
            'plan_code': plan_code,
            'type': 'subscription'
        }
    )

def create_payment_link(amount: float, description: str, user_id: str) -> Dict:
    """Créer un lien de paiement simple"""
    service = get_payment_service()
    return service.create_payment_link(
        amount=amount,
        description=description,
        customer_email=f'user-{user_id}@example.com',
        customer_name='User',
        metadata={'user_id': user_id}
    )
