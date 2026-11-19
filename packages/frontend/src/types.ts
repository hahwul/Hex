import type { Caido } from "@caido/sdk-frontend";
import type { Component } from "vue";

type ViewModeOptions = {
  label: string;
  view: { component: Component };
  when: (message: { raw?: string } | null | undefined) => boolean;
};

type ViewModes = {
  addRequestViewMode: (options: ViewModeOptions) => void;
  addResponseViewMode: (options: ViewModeOptions) => void;
};

// Define our frontend SDK type
export type FrontendSDK = Caido & {
  notifications?: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
  };
  window?: {
    showToast: (
      message: string,
      options?: {
        variant?: "success" | "error" | "warning" | "info";
        duration?: number;
      },
    ) => void;
  };
  httpHistory?: ViewModes;
  replay?: ViewModes;
  search?: ViewModes;
  sitemap?: ViewModes;
};
