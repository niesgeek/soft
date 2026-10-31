import {
  createContext,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

type RouterContextValue = {
  path: string;
  navigate: (to: string) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: string) => {
    const url = new URL(to, window.location.origin);
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.pushState({}, "", next);
    }
    setPath(url.pathname.replace(/\/+$/, "") || "/");
  };

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouter 需要 RouterProvider");
  return value;
}

export function TextLink({
  href,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate } = useRouter();
  return (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
