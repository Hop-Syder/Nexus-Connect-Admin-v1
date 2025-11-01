export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
      <h1 className="text-4xl font-bold mb-2 text-foreground">Page introuvable</h1>
      <p className="text-muted-foreground">
        La ressource demandée est introuvable ou a été déplacée.
      </p>
    </div>
  );
}
