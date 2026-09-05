declare module "playwright" {
  export const chromium: {
    launch(options?: { headless?: boolean }): Promise<{
      newPage(options?: { userAgent?: string }): Promise<{
        setDefaultTimeout(ms: number): void;
        goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
        getByText(
          text: string,
          options?: { exact?: boolean }
        ): {
          first(): { waitFor(options?: { timeout?: number }): Promise<unknown> };
        };
        content(): Promise<string>;
      }>;
      close(): Promise<void>;
    }>;
  };
}
