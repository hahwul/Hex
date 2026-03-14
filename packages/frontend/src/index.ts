import type { FrontendSDK } from "./types";
import HexViewMode from "./views/HexViewMode.vue";
import "./styles/index.css";

export const init = (sdk: FrontendSDK) => {
  const condition = (data: any): boolean => {
    return !!data?.raw; // Show Hex ViewMode only when raw data exists
  };

  const viewMode = {
    label: "Hex",
    view: {
      component: HexViewMode,
    },
    condition,
  };

  sdk.httpHistory?.addRequestViewMode(viewMode);
  sdk.httpHistory?.addResponseViewMode(viewMode);

  sdk.replay?.addRequestViewMode(viewMode);
  sdk.replay?.addResponseViewMode(viewMode);

  sdk.search?.addRequestViewMode(viewMode);
  sdk.search?.addResponseViewMode(viewMode);

  sdk.sitemap?.addRequestViewMode(viewMode);
  sdk.sitemap?.addResponseViewMode(viewMode);
};
