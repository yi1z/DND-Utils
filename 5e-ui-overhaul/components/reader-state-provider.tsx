"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
} from "react";

import type { ReaderState, ReaderTopicRef } from "../lib/types";

type ReaderStateContextValue = {
  state: ReaderState;
  isReady: boolean;
  isFavorite: (slugKey: string) => boolean;
  toggleFavorite: (topic: ReaderTopicRef) => void;
  markVisited: (topic: ReaderTopicRef) => void;
};

const STORAGE_KEY = "fivee-codex-reader-state";

const defaultState: ReaderState = {
  favorites: [],
  recentHistory: [],
  lastVisited: null,
};

const ReaderStateContext = createContext<ReaderStateContextValue | null>(null);

export function ReaderStateProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [state, setState] = useState<ReaderState>(defaultState);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setState(JSON.parse(saved) as ReaderState);
      }
    } catch {
      setState(defaultState);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [isReady, state]);

  function toggleFavorite(topic: ReaderTopicRef) {
    startTransition(() => {
      setState((current) => {
        const exists = current.favorites.some(
          (favorite) => favorite.slugKey === topic.slugKey,
        );

        return {
          ...current,
          favorites: exists
            ? current.favorites.filter(
                (favorite) => favorite.slugKey !== topic.slugKey,
              )
            : [topic, ...current.favorites].slice(0, 48),
        };
      });
    });
  }

  function markVisited(topic: ReaderTopicRef) {
    startTransition(() => {
      setState((current) => ({
        ...current,
        recentHistory: [
          topic,
          ...current.recentHistory.filter(
            (entry) => entry.slugKey !== topic.slugKey,
          ),
        ].slice(0, 12),
        lastVisited: topic,
      }));
    });
  }

  function isFavorite(slugKey: string) {
    return state.favorites.some((favorite) => favorite.slugKey === slugKey);
  }

  return (
    <ReaderStateContext.Provider
      value={{
        state,
        isReady,
        isFavorite,
        toggleFavorite,
        markVisited,
      }}
    >
      {children}
    </ReaderStateContext.Provider>
  );
}

export function useReaderState() {
  const context = useContext(ReaderStateContext);
  if (!context) {
    throw new Error("useReaderState must be used within ReaderStateProvider.");
  }
  return context;
}
