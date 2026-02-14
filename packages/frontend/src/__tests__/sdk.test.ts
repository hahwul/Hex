import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { App } from "vue";
import { SDKPlugin, useSDK } from "../plugins/sdk";
import type { FrontendSDK } from "../types";

describe("SDKPlugin", () => {
  it("registers the SDK with the app", () => {
    const app = {
      provide: vi.fn(),
    } as unknown as App;
    const sdk = {} as FrontendSDK;

    (SDKPlugin as any)(app, sdk);

    expect(app.provide).toHaveBeenCalledTimes(1);
    expect(app.provide).toHaveBeenCalledWith(expect.any(Symbol), sdk);
  });

  it("provides the SDK to components via useSDK", () => {
    const sdk = { foo: "bar" } as unknown as FrontendSDK;

    const TestComponent = {
      template: "<div></div>",
      setup() {
        const injectedSdk = useSDK();
        return { injectedSdk };
      },
    };

    const wrapper = mount(TestComponent, {
      global: {
        plugins: [[SDKPlugin, sdk]],
      },
    });

    expect(wrapper.vm.injectedSdk).toBe(sdk);
  });

  it("returns undefined when SDK is not provided", () => {
    const TestComponent = {
      template: "<div></div>",
      setup() {
        const injectedSdk = useSDK();
        return { injectedSdk };
      },
    };

    const wrapper = mount(TestComponent);

    expect(wrapper.vm.injectedSdk).toBeUndefined();
  });
});
