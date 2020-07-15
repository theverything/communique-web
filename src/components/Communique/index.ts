export type Listener = (msg: Message) => void;

export interface CommuniqueMessage {
  nic: string;
  msg: string;
}

export interface Message extends CommuniqueMessage {
  id: string;
  decay: number;
}

interface Ping {
  time: string;
}

function connect(url: string): Promise<EventSource> {
  return new Promise((resolve, reject) => {
    const evtSource = new EventSource(url);

    resolve(evtSource);

    // function error(e: Event) {
    //   evtSource.removeEventListener("error", error);
    //   evtSource.removeEventListener("open", open);
    //   console.log("connection error");
    //   reject(e);
    // }

    // function open() {
    //   evtSource.removeEventListener("error", error);
    //   evtSource.removeEventListener("open", open);
    //   console.log("connection open");
    //   resolve(evtSource);
    // }

    // evtSource.addEventListener("error", error, false);
    // evtSource.addEventListener("open", open, false);
  });
}

function ab2str(buf: ArrayBuffer) {
  return String.fromCharCode.apply(
    null,
    (new Uint8Array(buf) as unknown) as number[]
  );
}

function str2ab(str: string) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);

  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }

  return buf;
}

export class LockBox {
  private _key: CryptoKey;

  constructor(key: CryptoKey) {
    this._key = key;
  }

  static generateKey() {
    return window.crypto.subtle
      .generateKey(
        { name: "AES-GCM", length: 128 },
        true, // extractable
        ["encrypt", "decrypt"]
      )
      .then((key) => window.crypto.subtle.exportKey("jwk", key))
      .then((val) => val.k || "");
  }

  static importKey(objectKey: string) {
    return window.crypto.subtle.importKey(
      "jwk",
      {
        k: objectKey,
        alg: "A128GCM",
        ext: true,
        key_ops: ["encrypt", "decrypt"],
        kty: "oct",
      },
      { name: "AES-GCM", length: 128 },
      true, // extractable
      ["encrypt", "decrypt"]
    );
  }

  async encrypt(msg: CommuniqueMessage): Promise<string> {
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(12) /* don't reuse key! */,
      },
      this._key,
      new TextEncoder().encode(JSON.stringify(msg))
    );

    return ab2str(encrypted);
  }

  async decrypt(data: string): Promise<CommuniqueMessage> {
    const payload = str2ab(JSON.parse(data));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(12) },
      this._key,
      payload
    );
    const decoded = new window.TextDecoder().decode(new Uint8Array(decrypted));
    const msg = JSON.parse(decoded) as CommuniqueMessage;

    return msg;
  }
}

export class Communique {
  private _topic: string;
  private _host: string;
  private _eventSource: EventSource;
  private _lockBox: LockBox;
  private _listeners: Listener[];

  constructor(
    host: string,
    topic: string,
    eventSource: EventSource,
    lockBox: LockBox
  ) {
    this._host = host;
    this._topic = topic;
    this._eventSource = eventSource;
    this._lockBox = lockBox;
    this._listeners = [];

    this._eventSource.addEventListener("message", async (e) => {
      const msg = (await this._lockBox.decrypt(e.data)) as Message;

      msg.id = "msg_" + Math.random().toString(36).substr(2, 9);
      msg.decay = 0;

      this._listeners.forEach((l) => {
        l(msg);
      });
    });

    this._eventSource.addEventListener("ping", (e) => {}, false);
  }

  onMessage = (listener: Listener) => {
    this._listeners.push(listener);

    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  };

  close = () => {
    this._eventSource.close();
  };

  sendMessage = async (msg: CommuniqueMessage) => {
    const payload = await this._lockBox.encrypt(msg);

    return fetch(`${this._host}/api/dispatch`, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: this._topic,
        payload: payload,
      }),
    }).then(() => console.log("done"));
  };
}

export async function initCommunique(host: string, topic: string, key: string) {
  const [evtSource, cryptoKey] = await Promise.all([
    connect(`${host}/api/notify?topic=${topic}`),
    LockBox.importKey(key),
  ]);
  const lockBox = new LockBox(cryptoKey);

  return new Communique(host, topic, evtSource, lockBox);
}
