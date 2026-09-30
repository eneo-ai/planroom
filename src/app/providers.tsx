"use client";

import type { ReactNode } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import swedishMessages from "@astryxdesign/core/locales/sv-SE.json";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { SessionProvider } from "@/components/session";
import { AppFrame } from "@/components/app-frame";
import {
  DocumentDraftProvider,
  DraftAwareLink,
} from "@/components/document-drafts";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="light">
      <InternationalizationProvider
        locale="sv-SE"
        messages={{ "sv-SE": swedishMessages }}
      >
        <DocumentDraftProvider>
          <LinkProvider component={DraftAwareLink}>
            <SessionProvider>
              <AppFrame>{children}</AppFrame>
            </SessionProvider>
          </LinkProvider>
        </DocumentDraftProvider>
      </InternationalizationProvider>
    </Theme>
  );
}
