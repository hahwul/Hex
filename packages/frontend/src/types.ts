Hex / packages / frontend / src / types.ts;
import type { Caido } from "@caido/sdk-frontend";
import { type API } from "backend";

// Define our frontend SDK type
export type FrontendSDK = Caido<API, Record<string, never>> & {
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
  httpHistory?: {
    addRequestViewMode: (options: {
      label: string;
      view: { component: any };
      condition: (request: any) => boolean;
    }) => void;
  };
  replay?: {
    addRequestViewMode: (options: {
      label: string;
      view: { component: any };
      condition: (request: any) => boolean;
    }) => void;
  };
  search?: {
    addRequestViewMode: (options: {
      label: string;
      view: { component: any };
      condition: (request: any) => boolean;
    }) => void;
  };
  sitemap?: {
    addRequestViewMode: (options: {
      label: string;
      view: { component: any };
      condition: (request: any) => boolean;
    }) => void;
  };
};
