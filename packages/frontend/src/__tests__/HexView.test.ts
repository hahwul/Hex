import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import HexView from '../views/HexView.vue';
import { HexEditor } from '../HexEditor';

// Mock HexEditor
vi.mock('../HexEditor', () => {
  return {
    HexEditor: vi.fn().mockImplementation(function () {
      return {
        setData: vi.fn(),
        setEditable: vi.fn(),
        addEventListener: vi.fn(),
      };
    }),
  };
});

describe('HexView.vue', () => {
  let wrapper: ReturnType<typeof mount>;
  let mockHexEditorInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders and initializes HexEditor', () => {
    const modelValue = new Uint8Array([1, 2, 3]);
    const isEditable = true;

    wrapper = mount(HexView, {
      props: {
        modelValue,
        isEditable,
      },
    });

    expect(HexEditor).toHaveBeenCalledTimes(1);
    expect(HexEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      modelValue,
      isEditable
    );
  });

  it('updates data when modelValue prop changes', async () => {
    const initialValue = new Uint8Array([1]);
    wrapper = mount(HexView, {
      props: {
        modelValue: initialValue,
        isEditable: false,
      },
    });

    mockHexEditorInstance = (HexEditor as any).mock.results[0].value;

    const newValue = new Uint8Array([2]);
    await wrapper.setProps({ modelValue: newValue });

    expect(mockHexEditorInstance.setData).toHaveBeenCalledWith(newValue);
  });

  it('updates editable state when isEditable prop changes', async () => {
    wrapper = mount(HexView, {
      props: {
        modelValue: new Uint8Array([]),
        isEditable: false,
      },
    });

    mockHexEditorInstance = (HexEditor as any).mock.results[0].value;

    await wrapper.setProps({ isEditable: true });

    expect(mockHexEditorInstance.setEditable).toHaveBeenCalledWith(true);
  });

  it('emits update:modelValue when HexEditor changes (if initially editable)', () => {
    const modelValue = new Uint8Array([1]);
    wrapper = mount(HexView, {
      props: {
        modelValue,
        isEditable: true,
      },
    });

    mockHexEditorInstance = (HexEditor as any).mock.results[0].value;

    // Simulate change event
    // Find the callback passed to addEventListener
    const addEventListenerCall = mockHexEditorInstance.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'change'
    );
    expect(addEventListenerCall).toBeDefined();
    const callback = addEventListenerCall[1];

    const newValue = new Uint8Array([1, 2]);
    // Mock CustomEvent
    const event = { detail: newValue } as unknown as CustomEvent;

    // Invoke the callback
    callback(event);

    // Verify emission
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([newValue]);
  });
});
