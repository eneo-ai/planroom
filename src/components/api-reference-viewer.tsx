"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { apiReferenceConfiguration } from "@/client/api-reference";
import "@scalar/api-reference-react/style.css";

const Reference = dynamic(
  () =>
    import("@scalar/api-reference-react").then(
      (module) => module.ApiReferenceReact,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="center-state" role="status">
        Laddar API-referensen…
      </p>
    ),
  },
);

export function ApiReferenceViewer() {
  const [configuration, setConfiguration] = useState<ReturnType<
    typeof apiReferenceConfiguration
  > | null>(null);
  useEffect(() => {
    setConfiguration(apiReferenceConfiguration(window.location.origin));
  }, []);
  return configuration ? (
    <Reference configuration={configuration} />
  ) : (
    <p className="center-state" role="status">
      Förbereder API-referensen…
    </p>
  );
}
