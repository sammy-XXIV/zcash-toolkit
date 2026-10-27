// Covers the only Buffer usage in the toolkit: utf8 <-> base64 for payment headers.
const enc = new TextEncoder();
const dec = new TextDecoder();

class B {
  constructor(private bytes: Uint8Array) {}
  static from(v: string, encoding = "utf8"): B {
    if (encoding === "base64") return new B(Uint8Array.from(atob(v), (c) => c.charCodeAt(0)));
    return new B(enc.encode(v));
  }
  toString(encoding = "utf8"): string {
    if (encoding === "base64") return btoa(Array.from(this.bytes, (b) => String.fromCharCode(b)).join(""));
    return dec.decode(this.bytes);
  }
}

export { B as Buffer };
