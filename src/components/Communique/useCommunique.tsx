import React, { useState, useEffect, createContext, useContext } from "react";
import {
  Communique,
  initCommunique,
  MessageListener,
  MembershipListener,
} from "./";

function noop() {}

const emptyCommunique = ({
  onMessage: noop,
  close: noop,
  sendMessage: noop,
} as unknown) as Communique;

const Context = createContext<Communique>(emptyCommunique);

export function Provider({
  children,
  loader,
  host,
  topic,
  secret,
}: {
  children: React.ReactNode;
  loader: () => React.ReactNode;
  host: string;
  topic: string;
  secret: string;
}) {
  const [communique, setCommunique] = useState<Communique | null>(null);

  useEffect(() => {
    if (communique === null) {
      initCommunique(host, topic, secret).then((c) => {
        setCommunique(c);
      });
    }

    return () => {
      if (communique !== null) {
        communique.close();
      }
    };
  }, [communique, host, secret, topic]);

  if (communique === null) {
    return loader();
  }

  return <Context.Provider value={communique}>{children}</Context.Provider>;
}

export function useOnMessage(listener: MessageListener) {
  const communique = useContext(Context);

  useEffect(() => {
    const removeListener = communique.onMessage(listener);

    return () => {
      removeListener();
    };
  }, [communique, listener]);
}

export function useOnMembership(listener: MembershipListener) {
  const communique = useContext(Context);

  useEffect(() => {
    const removeListener = communique.onMembership(listener);

    return () => {
      removeListener();
    };
  }, [communique, listener]);
}

export function useSendMessage() {
  const communique = useContext(Context);

  return communique.sendMessage;
}
