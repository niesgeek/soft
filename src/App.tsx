import { RouterProvider, useRouter } from "./lib/router";
import { ThemeProvider } from "./lib/theme";
import { AdminPage } from "./pages/AdminPage";
import { HomePage } from "./pages/HomePage";

function Routes() {
  const { path } = useRouter();
  if (path === "/admin") return <AdminPage />;
  return <HomePage />;
}

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider>
        <Routes />
      </RouterProvider>
    </ThemeProvider>
  );
}
