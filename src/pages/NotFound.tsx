import { Link, Navigate, useLocation } from "react-router-dom";

export default function NotFound() {
  const location = useLocation();

  // Если URL содержит invite-токен — рекверим на /auth/invite.
  // Помогает при ссылках, в которых path/query разъехались (например
  // /auth/invite%3Finvite=... или /something/auth/invite?invite=...).
  const fullUrl = location.pathname + location.search + location.hash;
  const tokenMatch = fullUrl.match(/[?&]invite=([0-9a-fA-F-]{36})|\/invite\/([0-9a-fA-F-]{36})/);
  const token = tokenMatch?.[1] ?? tokenMatch?.[2];
  if (token) {
    return <Navigate to={`/auth/invite?invite=${token}`} replace />;
  }

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
