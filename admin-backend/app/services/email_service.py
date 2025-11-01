import logging
from typing import List, Dict, Optional
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, To, Content

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# SendGrid client
try:
    sg_client = SendGridAPIClient(settings.SENDGRID_API_KEY) if settings.SENDGRID_API_KEY else None
except Exception as e:
    logger.warning(f"SendGrid initialization failed: {str(e)}")
    sg_client = None

def send_email(
    to_email: str,
    to_name: str,
    subject: str,
    content: str,
    from_email: Optional[str] = None,
    from_name: Optional[str] = None
) -> bool:
    """Envoyer un e-mail simple
    
    Args:
        to_email: Email du destinataire
        to_name: Nom du destinataire
        subject: Sujet de l'e-mail
        content: Contenu HTML de l'e-mail
        from_email: Email expéditeur (optionnel)
        from_name: Nom expéditeur (optionnel)
    
    Returns:
        bool: True si envoi réussi, False sinon
    """
    if not sg_client:
        logger.warning("SendGrid not configured, email not sent")
        return False
    
    try:
        from_email = from_email or settings.EMAIL_FROM
        from_name = from_name or settings.EMAIL_FROM_NAME
        
        message = Mail(
            from_email=(from_email, from_name),
            to_emails=To(to_email, to_name),
            subject=subject,
            html_content=Content("text/html", content)
        )
        
        response = sg_client.send(message)
        
        if response.status_code in [200, 201, 202]:
            logger.info(f"Email sent successfully to {to_email}")
            return True
        else:
            logger.error(f"Email send failed: {response.status_code} - {response.body}")
            return False
    
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        return False

def send_bulk_email(
    recipients: List[Dict[str, str]],
    subject: str,
    content: str,
    from_email: Optional[str] = None,
    from_name: Optional[str] = None
) -> Dict[str, int]:
    """Envoyer un e-mail à plusieurs destinataires
    
    Args:
        recipients: Liste de dicts {'email': str, 'name': str}
        subject: Sujet de l'e-mail
        content: Contenu HTML de l'e-mail
        from_email: Email expéditeur (optionnel)
        from_name: Nom expéditeur (optionnel)
    
    Returns:
        Dict avec 'sent' et 'failed' counts
    """
    if not sg_client:
        logger.warning("SendGrid not configured, bulk email not sent")
        return {'sent': 0, 'failed': len(recipients)}
    
    sent = 0
    failed = 0
    
    for recipient in recipients:
        success = send_email(
            to_email=recipient['email'],
            to_name=recipient.get('name', ''),
            subject=subject,
            content=content,
            from_email=from_email,
            from_name=from_name
        )
        
        if success:
            sent += 1
        else:
            failed += 1
    
    logger.info(f"Bulk email complete: {sent} sent, {failed} failed")
    return {'sent': sent, 'failed': failed}

def send_template_email(
    to_email: str,
    to_name: str,
    template_id: str,
    template_data: Dict[str, str]
) -> bool:
    """Envoyer un e-mail avec template SendGrid
    
    Args:
        to_email: Email du destinataire
        to_name: Nom du destinataire
        template_id: ID du template SendGrid
        template_data: Données à insérer dans le template
    
    Returns:
        bool: True si envoi réussi, False sinon
    """
    if not sg_client:
        logger.warning("SendGrid not configured, template email not sent")
        return False
    
    try:
        message = Mail(
            from_email=(settings.EMAIL_FROM, settings.EMAIL_FROM_NAME),
            to_emails=To(to_email, to_name)
        )
        
        message.template_id = template_id
        message.dynamic_template_data = template_data
        
        response = sg_client.send(message)
        
        if response.status_code in [200, 201, 202]:
            logger.info(f"Template email sent successfully to {to_email}")
            return True
        else:
            logger.error(f"Template email send failed: {response.status_code}")
            return False
    
    except Exception as e:
        logger.error(f"Template email send error: {str(e)}")
        return False

def render_template(template_content: str, variables: Dict[str, str]) -> str:
    """Remplacer les variables dans un template
    
    Args:
        template_content: Contenu du template avec {{variables}}
        variables: Dict des variables à remplacer
    
    Returns:
        str: Contenu rendu
    """
    rendered = template_content
    
    for key, value in variables.items():
        placeholder = f"{{{{{key}}}}}"
        rendered = rendered.replace(placeholder, str(value))
    
    return rendered
