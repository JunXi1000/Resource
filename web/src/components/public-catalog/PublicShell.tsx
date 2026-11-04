import type { FC, ReactNode } from "react";

/**
 * Layout wrapper for public-catalog pages. Every visitor — signed in or not —
 * browses these pages inside the app chrome (sidebar + content sheet), so
 * this is now just a padded container; the former standalone header/footer
 * chrome was removed when the sidebar became available to anonymous users.
 */
export const PublicShell: FC<{ children: ReactNode }> = ({ children }) => {
  return <div className="px-6 py-6">{children}</div>;
};
