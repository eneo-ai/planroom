export interface LinkNavigation {
  href: string;
  currentUrl: string;
  target?: string;
  download: boolean;
  modified: boolean;
  prevented: boolean;
}

/** Only a navigation that replaces this tab can put its active draft at risk. */
export function shouldGuardDraftLink(link: LinkNavigation): boolean {
  if (
    link.modified ||
    link.prevented ||
    link.download ||
    (link.target && link.target !== "_self")
  )
    return false;
  const destination = new URL(link.href, link.currentUrl);
  const current = new URL(link.currentUrl);
  return (
    destination.origin === current.origin &&
    (destination.pathname !== current.pathname ||
      destination.search !== current.search)
  );
}
