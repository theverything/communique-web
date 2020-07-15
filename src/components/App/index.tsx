import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useParams,
  useLocation,
  useHistory,
} from "react-router-dom";
import cx from "classnames";
import "emoji-mart/css/emoji-mart.css";
import { Picker, BaseEmoji } from "emoji-mart";
import { LockBox, Message } from "../Communique";
import {
  Provider as CommuniqueProvider,
  useOnMessage,
  useSendMessage,
} from "../Communique/useCommunique";
import s from "./App.module.css";

const COMMUNIQUE_HOST =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8080"
    : "https://communique.jeffh.dev";

function CreateOrJoinRoom() {
  const history = useHistory();

  return (
    <div>
      <div>
        <button onClick={() => history.push("/create")}>Create a Room</button>
        <button onClick={() => history.push("/join")}>Join a Room</button>
      </div>
    </div>
  );
}

function Join() {
  const [nic, setNic] = useState("");
  const history = useHistory();
  const location = useLocation();

  const hash = new URLSearchParams(location.hash.replace("#", ""));

  const [room, setRoom] = useState(hash.get("room") || "");
  const [key, setKey] = useState(hash.get("key") || "");

  return (
    <div>
      <div>
        <div>
          <label htmlFor="room">Room Name</label>
          <input
            type="text"
            id="room"
            onChange={(e) => setRoom(e.target.value)}
            value={room}
          />
        </div>
        <div>
          <label htmlFor="nic">Your Name</label>
          <input
            type="text"
            id="nic"
            onChange={(e) => setNic(e.target.value)}
            value={nic}
          />
        </div>
        <div>
          <label htmlFor="key">Room Key</label>
          <input
            type="text"
            id="key"
            onChange={(e) => setKey(e.target.value)}
            value={key}
          />
        </div>
        <button onClick={() => history.push(`/${room}#nic=${nic}&key=${key}`)}>
          Join
        </button>
      </div>
    </div>
  );
}

function Create() {
  const [room, setRoom] = useState("");
  const [nic, setNic] = useState("");
  const history = useHistory();

  function createRoom() {
    LockBox.generateKey().then((jwk) => {
      history.push(`/${room}#nic=${nic}&key=${jwk}`);
    });
  }

  return (
    <div>
      <div>
        <div>
          <label htmlFor="room">Room Name</label>
          <input
            type="text"
            id="room"
            onChange={(e) => setRoom(e.target.value)}
            value={room}
          />
        </div>
        <div>
          <label htmlFor="nic">Your Name</label>
          <input
            type="text"
            id="nic"
            onChange={(e) => setNic(e.target.value)}
            value={nic}
          />
        </div>
        <button onClick={createRoom}>Create</button>
      </div>
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
        <Messages />
        <NewMessage nic={hash.get("nic") || ""} />
      </div>
    </CommuniqueProvider>
  );
}

function Messages() {
  const [messages, updateMessages] = useState<Message[]>([]);
  const onMessage = useCallback((msg: Message) => {
    updateMessages((msgs) => [
      msg,
      ...msgs.slice(0, 19).map((msg, i) => ({
        ...msg,
        decay: Math.max(msg.decay, Math.floor(i / 2)),
      })),
    ]);
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
    <div className={s.messages}>
      {messages.map((msg, i) => (
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
      sendMessage({ nic, msg }).then(() => updateMsg(""));
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

function ChatMessage({
  nic,
  msg,
  decay,
}: {
  nic: string;
  msg: string;
  decay: number;
}) {
  return (
    <div className={cx(s.message, s.decay, s[`decay${decay}`])}>
      <div className={s.nic}>{nic}</div>
      <pre className={s.content}>{msg}</pre>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className={s.container}>
        <Switch>
          <Route path="/" exact children={<CreateOrJoinRoom />} />
          <Route path="/create" exact children={<Create />} />
          <Route path="/join" exact children={<Join />} />
          <Route path="/:room" exact children={<Room />} />
        </Switch>
      </div>
    </Router>
  );
}

export default App;
