export type MessageListener = (msg: Message) => void;
export type MembershipListener = (members: number) => void;

type CommuniqueDispatch =
  | CommuniqueDispatchMessage
  | CommuniqueDispatchMembership;

interface CommuniqueDispatchMessage {
  type: "message";
  payload: string;
}

interface CommuniqueDispatchMembership {
  type: "membership";
  payload: number;
}

export interface CommuniqueMessagePayload {
  nic: string;
  msg: string;
  ts: number;
}

export interface Message extends CommuniqueMessagePayload {
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

  async encrypt(msg: CommuniqueMessagePayload): Promise<string> {
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

  async decrypt(data: string): Promise<CommuniqueMessagePayload> {
    const payload = str2ab(data);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(12) },
      this._key,
      payload
    );
    const decoded = new window.TextDecoder().decode(new Uint8Array(decrypted));
    const msg = JSON.parse(decoded) as CommuniqueMessagePayload;

    return msg;
  }
}

export class Communique {
  private _topic: string;
  private _host: string;
  private _eventSource: EventSource;
  private _lockBox: LockBox;
  private _msgListeners: MessageListener[];
  private _membershipListeners: MembershipListener[];

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
    this._msgListeners = [];
    this._membershipListeners = [];

    this._eventSource.addEventListener("message", async (e) => {
      const dispatch = JSON.parse(e.data) as CommuniqueDispatch;

      switch (dispatch.type) {
        case "message":
          this._handleMessage(e.lastEventId, dispatch.payload);
          break;
        case "membership":
          this._handleMembership(dispatch.payload);
          break;
        default:
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const _exhaustiveCheck: never = dispatch;
          break;
      }
    });

    this._eventSource.addEventListener("ping", (e) => {}, false);
  }

  private async _handleMessage(id: string, payload: string) {
    const msg = (await this._lockBox.decrypt(payload)) as Message;

    msg.id = id;
    msg.decay = 0;

    this._msgListeners.forEach((l) => {
      l(msg);
    });
  }

  private async _handleMembership(payload: number) {
    this._membershipListeners.forEach((l) => {
      l(payload);
    });
  }

  onMessage = (listener: MessageListener) => {
    this._msgListeners.push(listener);

    return () => {
      this._msgListeners = this._msgListeners.filter((l) => l !== listener);
    };
  };

  onMembership = (listener: MembershipListener) => {
    this._membershipListeners.push(listener);

    return () => {
      this._membershipListeners = this._membershipListeners.filter(
        (l) => l !== listener
      );
    };
  };

  close = () => {
    this._eventSource.close();
  };

  sendMessage = async (msg: CommuniqueMessagePayload) => {
    const payload = await this._lockBox.encrypt(msg);

    return fetch(`${this._host}/api/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: this._topic,
        payload: payload,
      }),
    });
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
