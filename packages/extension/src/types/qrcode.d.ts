declare module 'qrcode' {
  export function toDataURL(text: string): Promise<string>;
  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
  ): Promise<void>;
  export function toString(text: string): Promise<string>;
  // Add other methods you're using from qrcode
}
