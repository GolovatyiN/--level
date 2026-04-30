import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Страница не найдена</p>
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          На главную
        </Link>
      </div>
    </div>
  );
}
