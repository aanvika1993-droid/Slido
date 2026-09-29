"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  ActivePollPayload,
  EventDTO,
  JoinResult,
  MeDTO,
  PollDTO,
  QuestionDTO,
  QuizMeDTO,
  Role,
} from "./types";

const tokenKey = (code: string) => `pulse:participant:${code}`;

function readToken(code: string): string | undefined {
  try {
    return localStorage.getItem(tokenKey(code)) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveToken(code: string, token: string) {
  try {
    localStorage.setItem(tokenKey(code), token);
  } catch {
    // Storage unavailable (private mode); the participant just gets a new identity next visit.
  }
}

export interface EventRoom {
  status: "connecting" | "ready" | "error";
  error: string | null;
  connected: boolean;
  event: EventDTO | null;
  questions: QuestionDTO[];
  activePoll: ActivePollPayload;
  polls: PollDTO[];
  me: MeDTO | null;
  quizMe: QuizMeDTO | null;
  /** Server clock minus local clock, for quiz countdowns. */
  clockOffset: number;
  setMe: React.Dispatch<React.SetStateAction<MeDTO | null>>;
  call: <T = unknown>(name: string, payload?: unknown) => Promise<T>;
}

const emptyPoll: ActivePollPayload = { poll: null, results: null, leaderboard: null };

export function useEventRoom(code: string, role: Role): EventRoom {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<EventRoom["status"]>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [event, setEvent] = useState<EventDTO | null>(null);
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [activePoll, setActivePollState] = useState<ActivePollPayload>(emptyPoll);
  const [polls, setPolls] = useState<PollDTO[]>([]);
  const [me, setMe] = useState<MeDTO | null>(null);
  const [quizMe, setQuizMe] = useState<QuizMeDTO | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  const setActivePoll = useCallback((payload: ActivePollPayload) => {
    setActivePollState(payload);
    if (payload.poll?.quiz) setClockOffset(Date.parse(payload.poll.quiz.serverNow) - Date.now());
  }, []);

  useEffect(() => {
    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join", { code, role, token: role === "participant" ? readToken(code) : undefined }, (res: Ack<JoinResult>) => {
        if (!res.ok) {
          setStatus("error");
          setError(res.error);
          return;
        }
        const d = res.data;
        setEvent(d.event);
        setQuestions(d.questions);
        setActivePoll(d.activePoll);
        if (d.polls) setPolls(d.polls);
        if (d.me) {
          setMe(d.me);
          saveToken(code, d.me.token);
        }
        setStatus("ready");
        setError(null);
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("event:state", setEvent);
    socket.on("questions", setQuestions);
    socket.on("activePoll", setActivePoll);
    socket.on("polls", setPolls);
    socket.on("quiz:me", setQuizMe);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, role, setActivePoll]);

  const call = useCallback(<T,>(name: string, payload?: unknown) => {
    return new Promise<T>((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected) return reject(new Error("You're offline — reconnecting…"));
      socket.timeout(10000).emit(name, payload ?? {}, (err: Error | null, res: Ack<T>) => {
        if (err) return reject(new Error("The server didn't respond. Try again."));
        if (res.ok) resolve(res.data);
        else reject(new Error(res.error));
      });
    });
  }, []);

  return { status, error, connected, event, questions, activePoll, polls, me, quizMe, clockOffset, setMe, call };
}
