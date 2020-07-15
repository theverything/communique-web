import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useParams,
  useLocation,
  useHistory,
  Link,
} from "react-router-dom";
import cx from "classnames";
import "emoji-mart/css/emoji-mart.css";
import { Picker, BaseEmoji } from "emoji-mart";
import { LockBox, Message } from "../Communique";
import {
  Provider as CommuniqueProvider,
  useOnMessage,
  useSendMessage,
  useOnMembership,
} from "../Communique/useCommunique";
import s from "./App.module.css";

const COMMUNIQUE_HOST =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8080"
    : "https://communique.jeffh.dev";

function Eye() {
  return (
    <svg className={s.eye} viewBox="0 0 512 512">
      <path
        d="M255.66,112c-77.94,0-157.89,45.11-220.83,135.33a16,16,0,0,0-.27,17.77C82.92,340.8,161.8,400,255.66,400,348.5,400,429,340.62,477.45,264.75a16.14,16.14,0,0,0,0-17.47C428.89,172.28,347.8,112,255.66,112Z"
        style={{
          fill: "none",
          stroke: "#000",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 32,
        }}
      />
      <circle
        cx="256"
        cy="256"
        r="80"
        style={{
          fill: "none",
          stroke: "#000",
          strokeMiterlimit: 10,
          strokeWidth: 32,
        }}
      />
    </svg>
  );
}

function Join() {
  const [nic, setNic] = useState("");
  const history = useHistory();
  const location = useLocation();

  const hash = new URLSearchParams(location.hash.replace("#", ""));

  const room = hash.get("room") || "";
  const key = hash.get("key") || "";

  return (
    <div className={s.join}>
      <div className={s.nicInput}>
        <label htmlFor="nic">Your Name</label>
        <input
          type="text"
          id="nic"
          onChange={(e) => setNic(e.target.value)}
          value={nic}
        />
      </div>
      <button onClick={() => history.push(`/${room}#nic=${nic}&key=${key}`)}>
        Join
      </button>
    </div>
  );
}

function Create() {
  const [state, setState] = useState({ room: "", key: "" });

  function createRoom() {
    LockBox.generateKey().then((key) => {
      const room = "room_" + Math.random().toString(36).substr(2, 9);
      setState({ room, key });
    });
  }

  return (
    <div className={s.create}>
      {state.key !== "" ? (
        <>
          <div>Share the link below with your friends to chat.</div>
          <Link to={`/join#room=${state.room}&key=${state.key}`}>
            Join Room {state.room}
          </Link>
        </>
      ) : (
        <>
          <h1>Create a new room</h1>
          <button onClick={createRoom}>Do It</button>
        </>
      )}
    </div>
  );
}

function Members() {
  const [members, updateMembers] = useState();
  const onMembership = useCallback((m) => {
    updateMembers(m);
  }, []);

  useOnMembership(onMembership);

  return (
    <div className={s.members}>
      <span>{members}</span>
      <Eye />
    </div>
  );
}

function Room() {
  const { room } = useParams();
  const location = useLocation();
  const hash = new URLSearchParams(location.hash.replace("#", ""));

  return (
    // @ts-ignore
    <CommuniqueProvider
      host={COMMUNIQUE_HOST}
      topic={room}
      secret={hash.get("key") || ""}
      loader={() => "loading..."}
    >
      <div className={s.room}>
        <Members />
        <Messages />
        <NewMessage nic={hash.get("nic") || ""} />
      </div>
    </CommuniqueProvider>
  );
}

function Messages() {
  const container = useRef<HTMLDivElement>(null);
  const [messages, updateMessages] = useState<Message[]>([]);
  const onMessage = useCallback((msg: Message) => {
    updateMessages((msgs) => [
      msg,
      ...msgs.slice(0, 19).map((msg, i) => ({
        ...msg,
        decay: Math.max(msg.decay, Math.floor(i / 2)),
      })),
    ]);

    requestAnimationFrame(() => {
      container.current!.scrollTop = container.current!.scrollHeight;
    });
  }, []);

  useOnMessage(onMessage);

  useEffect(() => {
    const interval = setInterval(
      () =>
        updateMessages((msgs) =>
          msgs
            .map((msg) => ({ ...msg, decay: Math.min(msg.decay + 1, 10) }))
            .filter((msg) => msg.decay < 10)
        ),
      6 * 1000
    );

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div className={s.messages} ref={container}>
      {messages.map((msg) => (
        <ChatMessage key={msg.id} {...msg} />
      ))}
    </div>
  );
}

function NewMessage({ nic }: { nic: string }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendMessage();
  const [msg, updateMsg] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const submitMessage = useCallback(() => {
    if (msg !== "") {
      sendMessage({ nic, msg, ts: Date.now() }).then(() => updateMsg(""));
    }
  }, [msg, nic, sendMessage]);
  const onEmoji = useCallback((emoji: BaseEmoji) => {
    const field = textarea.current!;
    const value = emoji.native;

    if (field.selectionStart >= 0) {
      const startPos = field.selectionStart;
      const endPos = field.selectionEnd;

      updateMsg(
        (currVal) =>
          `${currVal.slice(0, startPos)}${value} ${currVal.slice(endPos)}`
      );
    } else {
      updateMsg(value);
    }

    setPickerOpen(false);
  }, []);

  return (
    <div className={s.newMessage}>
      <textarea
        ref={textarea}
        onChange={(e) => updateMsg(e.target.value)}
        value={msg}
        className={s.newMessageInput}
        onKeyPressCapture={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();

            submitMessage();
          }
        }}
      />
      <div className={s.buttons}>
        <button
          className={s.newMessageBtn}
          onClick={() => setPickerOpen((s) => !s)}
        >
          ☺
        </button>
        <button onClick={submitMessage} className={s.newMessageBtn}>
          ➤
        </button>
      </div>

      <div className={cx(s.emoji, { [s.emojiOpen]: pickerOpen })}>
        <Picker onSelect={onEmoji} />
      </div>
    </div>
  );
}

function ChatMessage({ nic, msg, decay, ts }: Message) {
  return (
    <div className={cx(s.message, s.decay, s[`decay${decay}`])}>
      <div className={s.msgTitle}>
        <span className={s.nic}>{nic}</span>{" "}
        <span className={s.ts}>{new Date(ts).toLocaleTimeString()}</span>
      </div>
      <pre className={s.content}>{msg}</pre>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className={s.container}>
        <Switch>
          <Route path="/" exact children={<Create />} />
          <Route path="/join" exact children={<Join />} />
          <Route path="/:room" exact children={<Room />} />
        </Switch>
      </div>
    </Router>
  );
}

export default App;
