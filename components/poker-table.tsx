"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Circle,
  CircleDollarSign,
  Clock3,
  Minus,
  Moon,
  PiggyBank,
  Plus,
  RotateCcw,
  Settings,
  Smartphone,
  Sun,
  Trophy,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Street = "Preflop" | "Flop" | "Turn" | "River" | "Showdown";
type Screen = "table" | "players" | "settings" | "history";

type Player = {
  id: string;
  name: string;
  buyIn: number;
  stack: number;
  inHand: boolean;
};

type LedgerItem = {
  id: string;
  label: string;
  amount: number;
};

type FeedbackSettings = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
};

type TableState = {
  players: Player[];
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  postedSmallBlind: boolean;
  postedBigBlind: boolean;
  currentPlayerIndex: number;
  currentBet: number;
  contributions: Record<string, number>;
  actedPlayerIds: string[];
  awaitingDeal: boolean;
  street: Street;
  pot: number;
  handNumber: number;
  ledger: LedgerItem[];
  isDark: boolean;
  feedback: FeedbackSettings;
};

const STORAGE_KEY = "table-stakes-state-v2";
const streets: Street[] = ["Preflop", "Flop", "Turn", "River", "Showdown"];
const defaultFeedbackSettings: FeedbackSettings = {
  soundEnabled: true,
  hapticsEnabled: true,
};

const initialState: TableState = {
  players: [
    { id: "p1", name: "Player 1", buyIn: 100, stack: 99, inHand: true },
    { id: "p2", name: "Player 2", buyIn: 100, stack: 98, inHand: true },
  ],
  dealerIndex: 0,
  smallBlind: 1,
  bigBlind: 2,
  postedSmallBlind: true,
  postedBigBlind: true,
  currentPlayerIndex: 0,
  currentBet: 2,
  contributions: { p1: 1, p2: 2 },
  actedPlayerIds: [],
  awaitingDeal: false,
  street: "Preflop",
  pot: 3,
  handNumber: 1,
  ledger: [],
  isDark: false,
  feedback: defaultFeedbackSettings,
};

type FeedbackEvent =
  | "nav"
  | "press"
  | "amountStep"
  | "amountDecrease"
  | "amountIncrease"
  | "amountMinimum"
  | "amountPot"
  | "amountAllIn"
  | "check"
  | "call"
  | "raise"
  | "allIn"
  | "fold"
  | "streetAdvance"
  | "dealConfirmed"
  | "potAwarded"
  | "newHand"
  | "needsChips"
  | "rebuy"
  | "themeChanged"
  | "reset"
  | "blocked";

type FeedbackPayload = {
  intensity?: FeedbackIntensity;
};

type FeedbackIntensity = "subtle" | "commit" | "success" | "destructive";

type FeedbackProfile = {
  audio: {
    type: OscillatorType;
    notes: number[];
    durationMs: number;
    peakGain: number;
    attackMs?: number;
    gapMs?: number;
    noteDurationsMs?: number[];
    detuneCents?: number[];
    endNotes?: number[];
  };
  haptic: number | number[];
  intensity: FeedbackIntensity;
};

type FeedbackState = {
  event: FeedbackEvent;
  key: number;
  intensity: FeedbackIntensity;
};

type AudioContextConstructor = new () => AudioContext;
const audioVolumeMultiplier = 3.4;

const feedbackProfiles: Record<FeedbackEvent, FeedbackProfile> = {
  nav: {
    audio: { type: "sine", notes: [392, 523], durationMs: 86, peakGain: 0.014, attackMs: 5, gapMs: 7 },
    haptic: 7,
    intensity: "subtle",
  },
  press: {
    audio: { type: "triangle", notes: [470], durationMs: 48, peakGain: 0.013, attackMs: 4 },
    haptic: 5,
    intensity: "subtle",
  },
  amountStep: {
    audio: {
      type: "square",
      notes: [780, 620],
      durationMs: 44,
      peakGain: 0.006,
      attackMs: 2,
      gapMs: 2,
      noteDurationsMs: [18, 18],
    },
    haptic: 4,
    intensity: "subtle",
  },
  amountDecrease: {
    audio: {
      type: "triangle",
      notes: [540, 410],
      durationMs: 58,
      peakGain: 0.01,
      attackMs: 2,
      gapMs: 3,
      noteDurationsMs: [22, 26],
      endNotes: [500, 360],
    },
    haptic: 4,
    intensity: "subtle",
  },
  amountIncrease: {
    audio: {
      type: "triangle",
      notes: [460, 610],
      durationMs: 58,
      peakGain: 0.011,
      attackMs: 2,
      gapMs: 3,
      noteDurationsMs: [22, 26],
      endNotes: [500, 680],
    },
    haptic: 5,
    intensity: "subtle",
  },
  amountMinimum: {
    audio: {
      type: "sine",
      notes: [294],
      durationMs: 72,
      peakGain: 0.014,
      attackMs: 7,
      endNotes: [262],
    },
    haptic: 6,
    intensity: "subtle",
  },
  amountPot: {
    audio: {
      type: "square",
      notes: [392, 392, 523],
      durationMs: 112,
      peakGain: 0.009,
      attackMs: 2,
      gapMs: 5,
      noteDurationsMs: [22, 22, 34],
    },
    haptic: [4, 10],
    intensity: "subtle",
  },
  amountAllIn: {
    audio: {
      type: "sawtooth",
      notes: [330, 494, 659],
      durationMs: 138,
      peakGain: 0.013,
      attackMs: 4,
      gapMs: 6,
      detuneCents: [0, 5, 0],
    },
    haptic: [5, 12, 7],
    intensity: "commit",
  },
  check: {
    audio: {
      type: "square",
      notes: [1180, 1480],
      durationMs: 66,
      peakGain: 0.01,
      attackMs: 1,
      gapMs: 8,
      noteDurationsMs: [14, 18],
    },
    haptic: 10,
    intensity: "commit",
  },
  call: {
    audio: {
      type: "triangle",
      notes: [330, 392, 330],
      durationMs: 132,
      peakGain: 0.021,
      attackMs: 5,
      gapMs: 6,
    },
    haptic: 12,
    intensity: "commit",
  },
  raise: {
    audio: {
      type: "sawtooth",
      notes: [392, 523, 698],
      durationMs: 164,
      peakGain: 0.014,
      attackMs: 6,
      gapMs: 5,
      detuneCents: [0, 4, 0],
    },
    haptic: [7, 16, 9],
    intensity: "commit",
  },
  allIn: {
    audio: {
      type: "sawtooth",
      notes: [294, 440, 659, 988],
      durationMs: 186,
      peakGain: 0.016,
      attackMs: 4,
      gapMs: 5,
      detuneCents: [0, 3, 5, 0],
    },
    haptic: [8, 14, 8, 18],
    intensity: "commit",
  },
  fold: {
    audio: {
      type: "sine",
      notes: [220, 150],
      durationMs: 146,
      peakGain: 0.017,
      attackMs: 10,
      gapMs: 10,
      endNotes: [196, 132],
    },
    haptic: 16,
    intensity: "destructive",
  },
  streetAdvance: {
    audio: {
      type: "sawtooth",
      notes: [660, 520, 420],
      durationMs: 142,
      peakGain: 0.011,
      attackMs: 4,
      gapMs: 3,
      endNotes: [610, 490, 390],
    },
    haptic: [6, 18],
    intensity: "commit",
  },
  dealConfirmed: {
    audio: {
      type: "triangle",
      notes: [740, 554],
      durationMs: 94,
      peakGain: 0.017,
      attackMs: 3,
      gapMs: 5,
      noteDurationsMs: [28, 42],
    },
    haptic: 9,
    intensity: "commit",
  },
  potAwarded: {
    audio: {
      type: "triangle",
      notes: [440, 660, 880, 740],
      durationMs: 236,
      peakGain: 0.024,
      attackMs: 7,
      gapMs: 8,
    },
    haptic: [10, 18, 10, 22],
    intensity: "success",
  },
  newHand: {
    audio: {
      type: "sine",
      notes: [262, 392, 523],
      durationMs: 214,
      peakGain: 0.019,
      attackMs: 9,
      gapMs: 10,
      detuneCents: [0, 0, 6],
    },
    haptic: [8, 16, 8],
    intensity: "success",
  },
  needsChips: {
    audio: {
      type: "triangle",
      notes: [220, 174],
      durationMs: 126,
      peakGain: 0.014,
      attackMs: 8,
      gapMs: 8,
      endNotes: [196, 147],
    },
    haptic: [12, 18],
    intensity: "destructive",
  },
  rebuy: {
    audio: {
      type: "sine",
      notes: [330, 440, 587],
      durationMs: 156,
      peakGain: 0.018,
      attackMs: 6,
      gapMs: 8,
    },
    haptic: [7, 14],
    intensity: "success",
  },
  themeChanged: {
    audio: {
      type: "sine",
      notes: [622, 466],
      durationMs: 118,
      peakGain: 0.015,
      attackMs: 12,
      gapMs: 9,
      endNotes: [659, 494],
    },
    haptic: 7,
    intensity: "subtle",
  },
  reset: {
    audio: {
      type: "triangle",
      notes: [330, 247, 185],
      durationMs: 178,
      peakGain: 0.018,
      attackMs: 7,
      gapMs: 7,
      endNotes: [294, 220, 165],
    },
    haptic: [15, 20, 15],
    intensity: "destructive",
  },
  blocked: {
    audio: {
      type: "square",
      notes: [118, 118],
      durationMs: 82,
      peakGain: 0.007,
      attackMs: 2,
      gapMs: 18,
      noteDurationsMs: [22, 22],
      detuneCents: [0, -24],
    },
    haptic: [16, 16],
    intensity: "destructive",
  },
};

const navItems = [
  { href: "/", label: "Hand", icon: CircleDollarSign },
  { href: "/players", label: "Players", icon: UsersRound },
  { href: "/history", label: "History", icon: Clock3 },
  { href: "/settings", label: "Setup", icon: Settings },
];

const playerColorClasses = [
  "border-black bg-blue-600 text-white",
  "border-black bg-red-600 text-white",
  "border-black bg-emerald-600 text-white",
  "border-black bg-amber-400 text-black",
  "border-black bg-violet-600 text-white",
  "border-black bg-pink-500 text-white",
  "border-black bg-cyan-500 text-black",
  "border-black bg-orange-500 text-black",
];

function currency(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

function playerColorClass(index: number) {
  return playerColorClasses[index % playerColorClasses.length];
}

function nextId() {
  return crypto.randomUUID();
}

function rotateIndex(current: number, length: number, offset: number) {
  return length ? (current + offset) % length : 0;
}

function playerCanPlay(player: Player) {
  return player.stack > 0;
}

function fundedPlayers(players: Player[]) {
  return players.filter(playerCanPlay);
}

function nextFundedIndex(players: Player[], fromIndex: number) {
  if (!players.length) {
    return 0;
  }

  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = rotateIndex(fromIndex, players.length, offset);
    if (playerCanPlay(players[index])) {
      return index;
    }
  }

  return fromIndex;
}

function getFundedBlindIndexes(players: Player[], dealerIndex: number) {
  const fundedIndexes = players
    .map((player, index) => (playerCanPlay(player) ? index : -1))
    .filter((index) => index >= 0);

  if (fundedIndexes.length <= 1) {
    const fallbackIndex = fundedIndexes[0] ?? dealerIndex;
    return {
      dealerIndex: fallbackIndex,
      smallBlindIndex: fallbackIndex,
      bigBlindIndex: fallbackIndex,
    };
  }

  const dealerPosition = fundedIndexes.indexOf(dealerIndex);
  const normalizedDealerIndex =
    dealerPosition >= 0 ? dealerIndex : nextFundedIndex(players, dealerIndex);
  const normalizedDealerPosition = fundedIndexes.indexOf(normalizedDealerIndex);
  const fundedOffset = (offset: number) =>
    fundedIndexes[(normalizedDealerPosition + offset) % fundedIndexes.length];

  if (fundedIndexes.length === 2) {
    return {
      dealerIndex: normalizedDealerIndex,
      smallBlindIndex: normalizedDealerIndex,
      bigBlindIndex: fundedOffset(1),
    };
  }

  return {
    dealerIndex: normalizedDealerIndex,
    smallBlindIndex: fundedOffset(1),
    bigBlindIndex: fundedOffset(2),
  };
}

function getStoredState(): TableState {
  if (typeof window === "undefined") {
    return initialState;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return initialState;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<TableState>;
    return {
      ...initialState,
      ...parsed,
      contributions: parsed.contributions ?? {},
      actedPlayerIds: parsed.actedPlayerIds ?? [],
      currentBet: parsed.currentBet ?? 0,
      currentPlayerIndex: parsed.currentPlayerIndex ?? 0,
      awaitingDeal: parsed.awaitingDeal ?? false,
      feedback: {
        ...defaultFeedbackSettings,
        ...(parsed.feedback ?? {}),
      },
    } as TableState;
  } catch {
    return initialState;
  }
}

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
  );
}

function useInteractionFeedback(settings: FeedbackSettings) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const feedbackKeyRef = useRef(0);
  const [lastFeedback, setLastFeedback] = useState<FeedbackState | null>(null);

  const playCue = useCallback((profile: FeedbackProfile) => {
    const AudioContextClass = getAudioContextConstructor();
    if (!AudioContextClass) {
      return;
    }

    try {
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;

      if (context.state === "suspended") {
        context.resume().catch(() => undefined);
      }

      const startAt = context.currentTime + 0.005;
      const totalDuration = profile.audio.durationMs / 1000;
      const gap = (profile.audio.gapMs ?? 0) / 1000;
      const totalGap = gap * Math.max(0, profile.audio.notes.length - 1);
      const fallbackNoteDuration =
        (totalDuration - totalGap) / Math.max(1, profile.audio.notes.length);
      const attack = (profile.audio.attackMs ?? 8) / 1000;
      const gain = context.createGain();

      const peakGain = Math.min(profile.audio.peakGain * audioVolumeMultiplier, 0.11);

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(peakGain, startAt + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + totalDuration);
      gain.connect(context.destination);

      let noteStart = startAt;
      profile.audio.notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const noteDuration =
          (profile.audio.noteDurationsMs?.[index] ?? fallbackNoteDuration * 1000) / 1000;
        const noteEnd = noteStart + noteDuration;
        const endFrequency = profile.audio.endNotes?.[index];

        oscillator.type = profile.audio.type;
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        oscillator.detune.setValueAtTime(profile.audio.detuneCents?.[index] ?? 0, noteStart);
        if (endFrequency) {
          oscillator.frequency.exponentialRampToValueAtTime(endFrequency, noteEnd);
        }
        oscillator.connect(gain);
        oscillator.start(noteStart);
        oscillator.stop(noteEnd + 0.01);
        noteStart = noteEnd + gap;
      });
    } catch {
      audioContextRef.current = null;
    }
  }, []);

  const emitFeedback = useCallback(
    (event: FeedbackEvent, payload?: FeedbackPayload) => {
      const profile = feedbackProfiles[event];
      const intensity = payload?.intensity ?? profile.intensity;

      feedbackKeyRef.current += 1;
      setLastFeedback({ event, key: feedbackKeyRef.current, intensity });

      if (settings.hapticsEnabled && "vibrate" in navigator) {
        navigator.vibrate(profile.haptic);
      }

      if (settings.soundEnabled) {
        playCue(profile);
      }
    },
    [playCue, settings.hapticsEnabled, settings.soundEnabled],
  );

  return {
    emitFeedback,
    lastFeedbackEvent: lastFeedback,
  };
}

function feedbackPulseClass(
  lastFeedback: FeedbackState | null,
  events: FeedbackEvent[],
  className = "",
) {
  if (!lastFeedback || !events.includes(lastFeedback.event)) {
    return "";
  }

  return cn(
    lastFeedback.key % 2 === 0 ? "feedback-pulse-even" : "feedback-pulse-odd",
    `feedback-${lastFeedback.intensity}`,
    className,
  );
}

function AnimatedNumber({
  className,
  value,
}: {
  className?: string;
  value: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [direction, setDirection] = useState<"up" | "down" | "same">("same");
  const previousValueRef = useRef(value);

  useEffect(() => {
    const startValue = previousValueRef.current;
    const change = value - startValue;

    if (change === 0) {
      setDirection("same");
      setDisplayValue(value);
      return;
    }

    setDirection(change > 0 ? "up" : "down");
    let frameId = 0;
    const startedAt = window.performance.now();
    const durationMs = Math.min(520, Math.max(220, Math.abs(change) * 28));

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplayValue(Math.round(startValue + change * eased));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate);
      } else {
        previousValueRef.current = value;
      }
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      previousValueRef.current = value;
    };
  }, [value]);

  return (
    <span
      key={`${direction}-${value}`}
      className={cn(
        "animated-number",
        direction === "up" && "animated-number-up",
        direction === "down" && "animated-number-down",
        className,
      )}
    >
      {currency(displayValue)}
    </span>
  );
}

function nextActiveIndex(players: Player[], fromIndex: number) {
  if (!players.length) {
    return 0;
  }

  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = rotateIndex(fromIndex, players.length, offset);
    if (players[index]?.inHand && players[index].stack > 0) {
      return index;
    }
  }

  return fromIndex;
}

function firstToActIndex(players: Player[], dealerIndex: number, street: Street) {
  const fundedCount = fundedPlayers(players).length;
  if (fundedCount <= 1) {
    return nextFundedIndex(players, dealerIndex);
  }

  if (fundedCount === 2) {
    return street === "Preflop"
      ? dealerIndex
      : nextFundedIndex(players, dealerIndex);
  }

  return street === "Preflop"
    ? nextFundedIndex(players, nextFundedIndex(players, nextFundedIndex(players, dealerIndex)))
    : nextFundedIndex(players, dealerIndex);
}

function resetBettingForStreet(state: TableState, street: Street): TableState {
  return {
    ...state,
    street,
    currentBet: 0,
    contributions: {},
    actedPlayerIds: [],
    awaitingDeal: street !== "Showdown",
    currentPlayerIndex: firstToActIndex(state.players, state.dealerIndex, street),
  };
}

function bettingIsClosed(state: TableState) {
  const contenders = state.players.filter((player) => player.inHand);
  if (contenders.length <= 1) {
    return true;
  }

  const playersWhoCanAct = contenders.filter((player) => player.stack > 0);
  if (
    playersWhoCanAct.length <= 1 &&
    playersWhoCanAct.every((player) => (state.contributions[player.id] ?? 0) === state.currentBet)
  ) {
    return true;
  }

  return contenders.every((player) => {
    const contribution = state.contributions[player.id] ?? 0;
    return (
      player.stack === 0 ||
      (state.actedPlayerIds.includes(player.id) && contribution === state.currentBet)
    );
  });
}

function bettingRunoutIsLocked(state: TableState) {
  const contenders = state.players.filter((player) => player.inHand);
  return contenders.length > 1 && contenders.filter((player) => player.stack > 0).length <= 1;
}

function maxSinglePotBetTotal(state: TableState) {
  const contenders = state.players.filter((player) => player.inHand);
  if (!contenders.length) {
    return state.currentBet;
  }

  return Math.max(
    state.currentBet,
    Math.min(
      ...contenders.map((player) => (state.contributions[player.id] ?? 0) + player.stack),
    ),
  );
}

function nextStreetAfter(street: Street) {
  if (street === "Preflop") return "Flop";
  if (street === "Flop") return "Turn";
  if (street === "Turn") return "River";
  return "Showdown";
}

function advanceAllInRunout(state: TableState) {
  const next = nextStreetAfter(state.street);
  return resetBettingForStreet(state, next);
}

export function PokerTable({ screen = "table" }: { screen?: Screen }) {
  const pathname = usePathname();
  const [table, setTable] = useState<TableState>(initialState);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [chipAmount, setChipAmount] = useState(4);
  const { emitFeedback, lastFeedbackEvent } = useInteractionFeedback(table.feedback);

  useEffect(() => {
    const restoreId = window.setTimeout(() => {
      setTable(getStoredState());
      setHasHydrated(true);
    }, 0);

    return () => window.clearTimeout(restoreId);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(table));
    document.documentElement.classList.toggle("dark", table.isDark);
  }, [hasHydrated, table]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | undefined;
    let isMounted = true;

    const requestWakeLock = async () => {
      if (!("wakeLock" in navigator)) {
        return;
      }

      try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => undefined);
      } catch {
        if (isMounted) {
          wakeLock = undefined;
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };

    requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLock?.release().catch(() => undefined);
    };
  }, []);

  const activePlayers = table.players.filter((player) => player.inHand);
  const streetIndex = streets.indexOf(table.street);
  const currentPlayer = table.players[table.currentPlayerIndex];
  const currentContribution = currentPlayer ? table.contributions[currentPlayer.id] ?? 0 : 0;
  const toCall = Math.max(0, table.currentBet - currentContribution);

  const instruction = useMemo(() => {
    if (table.players.length < 2) {
      return "Add another player";
    }

    if (table.awaitingDeal) {
      return `Deal the ${table.street.toLowerCase()}`;
    }

    if (table.street === "Showdown" && table.pot > 0) {
      return "Who won the pot?";
    }

    if (table.street === "Showdown") {
      return "Ready for the next hand";
    }

    if (!currentPlayer) {
      return "Choose the next move";
    }

    if (toCall > 0) {
      const callAmount = currentPlayer ? Math.min(toCall, currentPlayer.stack) : toCall;
      return callAmount < toCall
        ? `Call all in for ${currency(callAmount)}`
        : `Put in ${currency(callAmount)} more to stay in`;
    }

    return table.currentBet > 0
      ? "Nothing owed. You can check or raise."
      : "No bet yet. Check or open the betting.";
  }, [
    currentPlayer,
    table.awaitingDeal,
    table.currentBet,
    table.players.length,
    table.pot,
    table.street,
    toCall,
  ]);

  function updatePlayer(id: string, patch: Partial<Player>) {
    setTable((current) => ({
      ...current,
      players: current.players.map((player) => {
        if (player.id !== id) {
          return player;
        }

        const stack =
          patch.stack !== undefined
            ? Math.max(0, Number.isFinite(patch.stack) ? patch.stack : 0)
            : player.stack;
        const buyIn =
          patch.buyIn !== undefined
            ? Math.max(0, Number.isFinite(patch.buyIn) ? patch.buyIn : 0)
            : player.buyIn;

        return {
          ...player,
          ...patch,
          stack,
          buyIn,
          inHand: stack > 0 && (patch.inHand ?? player.inHand),
        };
      }),
    }));
  }

  function addChips(playerId: string, amount?: number) {
    const player = table.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      emitFeedback("blocked");
      return;
    }

    const topUpAmount = Math.max(1, Math.round(amount ?? (player.buyIn || 100)));
    emitFeedback("rebuy");
    setTable((current) => ({
      ...current,
      players: current.players.map((candidate) =>
        candidate.id === playerId
          ? {
              ...candidate,
              buyIn: Math.max(candidate.buyIn, topUpAmount),
              stack: candidate.stack + topUpAmount,
              inHand:
                current.street === "Showdown" && current.pot === 0 ? true : candidate.inHand,
            }
          : candidate,
      ),
      ledger: [
        { id: nextId(), label: `${player.name} adds ${currency(topUpAmount)} chips`, amount: topUpAmount },
        ...current.ledger.slice(0, 10),
      ],
    }));
  }

  function addPlayer() {
    const name = newPlayerName.trim() || `Player ${table.players.length + 1}`;
    emitFeedback("press");
    setTable((current) => ({
      ...current,
      players: [
        ...current.players,
        { id: nextId(), name, buyIn: 100, stack: 100, inHand: true },
      ],
    }));
    setNewPlayerName("");
  }

  function settleIfOnlyOnePlayer(state: TableState) {
    const contenders = state.players.filter((player) => player.inHand);
    if (contenders.length !== 1 || state.pot <= 0) {
      return state;
    }

    const winner = contenders[0];
    return {
      ...state,
      ledger: [
        { id: nextId(), label: `${winner.name} wins ${currency(state.pot)}`, amount: state.pot },
        ...state.ledger.slice(0, 10),
      ],
      players: state.players.map((player) =>
        player.id === winner.id ? { ...player, stack: player.stack + state.pot } : player,
      ),
      pot: 0,
      street: "Showdown" as Street,
      awaitingDeal: false,
    };
  }

  function finishAction(state: TableState, actorIndex: number) {
    const settled = settleIfOnlyOnePlayer(state);
    if (settled !== state) {
      return settled;
    }

    if (bettingIsClosed(state)) {
      if (bettingRunoutIsLocked(state)) {
        return advanceAllInRunout(state);
      }

      const next = nextStreetAfter(state.street);
      return resetBettingForStreet(state, next);
    }

    return {
      ...state,
      currentPlayerIndex: nextActiveIndex(state.players, actorIndex),
    };
  }

  function applyPlayerAction(action: "check" | "call" | "fold" | "raise", raiseTo?: number) {
    const actor = table.players[table.currentPlayerIndex];
    if (!actor || table.awaitingDeal || table.street === "Showdown") {
      emitFeedback("blocked");
      return;
    }

    const actorAllInTotal = (table.contributions[actor.id] ?? 0) + actor.stack;
    const isAllInRaise = action === "raise" && (raiseTo ?? 0) >= actorAllInTotal;
    emitFeedback(isAllInRaise ? "allIn" : action);
    setTable((current) => {
      const currentActor = current.players[current.currentPlayerIndex];
      if (!currentActor) {
        return current;
      }

      const previousContribution = current.contributions[currentActor.id] ?? 0;
      const owed = Math.max(0, current.currentBet - previousContribution);
      const raiseCap = Math.min(
        previousContribution + currentActor.stack,
        maxSinglePotBetTotal(current),
      );
      const minimumRaiseTo = current.currentBet + current.bigBlind;
      const requestedRaiseTo = Math.max(raiseTo ?? minimumRaiseTo, minimumRaiseTo);
      const targetBet =
        action === "raise" ? Math.min(requestedRaiseTo, raiseCap) : current.currentBet;
      const effectiveAction =
        action === "raise" && targetBet <= current.currentBet
          ? owed > 0
            ? "call"
            : "check"
          : action;
      const amount =
        effectiveAction === "fold"
          ? 0
          : effectiveAction === "raise"
            ? Math.min(Math.max(0, targetBet - previousContribution), currentActor.stack)
            : Math.min(owed, currentActor.stack);
      const totalContribution = previousContribution + amount;
      const nextCurrentBet =
        effectiveAction === "raise"
          ? Math.max(current.currentBet, totalContribution)
          : current.currentBet;

      const nextState: TableState = {
        ...current,
        currentBet: nextCurrentBet,
        pot: current.pot + amount,
        contributions: {
          ...current.contributions,
          [currentActor.id]: totalContribution,
        },
        actedPlayerIds:
          effectiveAction === "raise"
            ? [currentActor.id]
            : Array.from(new Set([...current.actedPlayerIds, currentActor.id])),
        ledger: [
          {
            id: nextId(),
            label:
              effectiveAction === "fold"
                ? `${currentActor.name} folds`
                : effectiveAction === "check"
                  ? `${currentActor.name} checks`
                  : effectiveAction === "call"
                    ? amount < owed
                      ? `${currentActor.name} calls all in ${currency(amount)}`
                      : `${currentActor.name} calls ${currency(amount)}`
                    : `${currentActor.name} raises to ${currency(totalContribution)}`,
            amount,
          },
          ...current.ledger.slice(0, 10),
        ],
        players: current.players.map((player) =>
          player.id === currentActor.id
            ? {
                ...player,
                inHand: effectiveAction === "fold" ? false : player.inHand,
                stack: Math.max(0, player.stack - amount),
              }
            : player,
        ),
      };

      return finishAction(nextState, current.currentPlayerIndex);
    });
  }

  function awardPot(playerId: string) {
    const winner = table.players.find((player) => player.id === playerId);
    if (!winner || table.pot <= 0) {
      emitFeedback("blocked");
      return;
    }

    emitFeedback("potAwarded");
    setTable((current) => ({
      ...current,
      ledger: [
        { id: nextId(), label: `${winner.name} wins ${currency(current.pot)}`, amount: current.pot },
        ...current.ledger.slice(0, 10),
      ],
      players: current.players.map((player) => {
        const stack = player.id === playerId ? player.stack + current.pot : player.stack;
        return {
          ...player,
          stack,
          inHand: stack > 0,
        };
      }),
      pot: 0,
      street: "Showdown",
    }));
  }

  function nextHand() {
    if (fundedPlayers(table.players).length < 2) {
      emitFeedback("needsChips");
      return;
    }

    emitFeedback("newHand");
    setTable((current) => {
      const playablePlayers = fundedPlayers(current.players);
      if (playablePlayers.length < 2) {
        return current;
      }

      const dealerIndex = nextFundedIndex(current.players, current.dealerIndex);
      const { smallBlindIndex: nextSmallBlindIndex, bigBlindIndex: nextBigBlindIndex } =
        getFundedBlindIndexes(current.players, dealerIndex);
      const effectiveStack = Math.min(...playablePlayers.map((player) => player.stack));
      let pot = 0;
      const contributions: Record<string, number> = {};
      const players = current.players.map((player, index) => {
        const blind =
          index === nextSmallBlindIndex
            ? current.smallBlind
            : index === nextBigBlindIndex
              ? current.bigBlind
              : 0;
        const paid = playerCanPlay(player) ? Math.min(blind, player.stack, effectiveStack) : 0;
        if (paid > 0) {
          pot += paid;
          contributions[player.id] = paid;
        }
        return {
          ...player,
          stack: Math.max(0, player.stack - paid),
          inHand: playerCanPlay(player),
        };
      });
      const currentBet = Math.max(0, ...Object.values(contributions));
      const nextState: TableState = {
        ...current,
        players,
        dealerIndex,
        postedSmallBlind: true,
        postedBigBlind: true,
        currentBet,
        contributions,
        actedPlayerIds: [],
        awaitingDeal: false,
        currentPlayerIndex: firstToActIndex(players, dealerIndex, "Preflop"),
        street: "Preflop",
        handNumber: current.handNumber + 1,
        pot,
        ledger: [
          { id: nextId(), label: `Hand ${current.handNumber + 1} started`, amount: pot },
          ...current.ledger.slice(0, 10),
        ],
      };

      return bettingIsClosed(nextState) && bettingRunoutIsLocked(nextState)
        ? advanceAllInRunout(nextState)
        : nextState;
    });
  }

  function resetTable() {
    emitFeedback("reset");
    setTable((current) => ({
      ...initialState,
      isDark: current.isDark,
      feedback: current.feedback,
    }));
  }

  return (
    <main className="min-h-svh overflow-hidden bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+68px)] pt-[calc(env(safe-area-inset-top)+8px)] text-foreground">
      <div className="app-frame mx-auto flex h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-76px)] w-full max-w-md flex-col overflow-hidden">
        <TopBar screen={screen} />

        {screen === "table" ? (
          <HandScreen
            activePlayers={activePlayers}
            addChips={addChips}
            addPlayer={addPlayer}
            acknowledgeDeal={() => {
              emitFeedback(table.awaitingDeal ? "dealConfirmed" : "streetAdvance");
              setTable((current) => {
                if (bettingRunoutIsLocked(current)) {
                  return advanceAllInRunout(current);
                }

                return { ...current, awaitingDeal: false };
              });
            }}
            applyPlayerAction={applyPlayerAction}
            awardPot={awardPot}
            chipAmount={chipAmount}
            currentPlayer={currentPlayer}
            instruction={instruction}
            lastFeedbackEvent={lastFeedbackEvent}
            newPlayerName={newPlayerName}
            nextHand={nextHand}
            emitFeedback={emitFeedback}
            setChipAmount={setChipAmount}
            setNewPlayerName={setNewPlayerName}
            streetIndex={streetIndex}
            table={table}
            toCall={toCall}
          />
        ) : null}

        {screen === "players" ? (
          <PlayersScreen
            addChips={addChips}
            addPlayer={addPlayer}
            newPlayerName={newPlayerName}
            setNewPlayerName={setNewPlayerName}
            table={table}
            updatePlayer={updatePlayer}
          />
        ) : null}

        {screen === "history" ? <HistoryScreen table={table} /> : null}

        {screen === "settings" ? (
          <SettingsScreen
            emitFeedback={emitFeedback}
            resetTable={resetTable}
            setTable={setTable}
            table={table}
          />
        ) : null}
      </div>
      <BottomNav
        emitFeedback={emitFeedback}
        lastFeedbackEvent={lastFeedbackEvent}
        pathname={pathname}
      />
    </main>
  );
}

function TopBar({ screen }: { screen: Screen }) {
  if (screen === "table") {
    return null;
  }

  const title =
    screen === "players"
      ? "Players"
      : screen === "history"
        ? "History"
        : "Setup";

  return (
    <header className="motion-panel mb-4 flex min-h-12 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1">
        <h1 className="truncate text-[34px] font-bold leading-none">{title}</h1>
      </div>
      <div className="size-11" aria-hidden="true" />
    </header>
  );
}

function HandScreen({
  activePlayers,
  addChips,
  addPlayer,
  acknowledgeDeal,
  applyPlayerAction,
  awardPot,
  chipAmount,
  currentPlayer,
  emitFeedback,
  instruction,
  lastFeedbackEvent,
  newPlayerName,
  nextHand,
  setChipAmount,
  setNewPlayerName,
  streetIndex,
  table,
  toCall,
}: {
  activePlayers: Player[];
  addChips: (playerId: string, amount?: number) => void;
  addPlayer: () => void;
  acknowledgeDeal: () => void;
  applyPlayerAction: (action: "check" | "call" | "fold" | "raise", raiseTo?: number) => void;
  awardPot: (playerId: string) => void;
  chipAmount: number;
  currentPlayer?: Player;
  emitFeedback: (event: FeedbackEvent, payload?: FeedbackPayload) => void;
  instruction: string;
  lastFeedbackEvent: FeedbackState | null;
  newPlayerName: string;
  nextHand: () => void;
  setChipAmount: Dispatch<SetStateAction<number>>;
  setNewPlayerName: (value: string) => void;
  streetIndex: number;
  table: TableState;
  toCall: number;
}) {
  const currentPlayerColor = playerColorClass(Math.max(table.currentPlayerIndex, 0));
  const isShowdown = table.street === "Showdown";
  const needsWinner = isShowdown && table.pot > 0;
  const playersNeedingChips = table.players.filter((player) => player.stack <= 0);
  const fundedCount = fundedPlayers(table.players).length;
  const needsChipsToContinue = isShowdown && table.pot === 0 && fundedCount < 2;
  const latestPayout = table.ledger.find((item) => item.label.includes(" wins "));
  const statusLabel = needsWinner
    ? "Choose winner"
    : needsChipsToContinue
      ? "Needs chips"
    : isShowdown
      ? "Pot paid"
      : currentPlayer
        ? `${currentPlayer.name}'s turn`
        : "Player turn";

  return (
    <section className="screen-panel flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "motion-surface mb-2 rounded-xl bg-secondary px-4 py-3",
          needsWinner && "bg-primary/10",
          feedbackPulseClass(lastFeedbackEvent, ["check", "call", "raise", "allIn", "fold", "potAwarded"]),
        )}
      >
        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Hand {table.handNumber} · {table.street}
            </p>
            <p
              className={cn(
                "motion-panel mt-1 inline-block max-w-full truncate rounded-lg border-2 px-2.5 py-1 text-2xl font-black leading-none shadow-[2px_2px_0_#000] transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none",
                feedbackPulseClass(lastFeedbackEvent, ["check", "call", "raise", "allIn", "fold"]),
                needsWinner
                  ? "border-black bg-primary text-primary-foreground"
                  : needsChipsToContinue
                    ? "border-black bg-destructive text-destructive-foreground"
                  : isShowdown
                    ? "border-black bg-emerald-600 text-white"
                    : currentPlayerColor,
              )}
            >
              {statusLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold text-muted-foreground">Total pot</p>
            <p className="text-3xl font-black leading-none">
              <span
                className={cn(
                  "motion-value",
                  feedbackPulseClass(lastFeedbackEvent, ["call", "raise", "allIn", "potAwarded", "newHand"]),
                )}
              >
                <AnimatedNumber value={table.pot} />
              </span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
          <span>
            {needsWinner
              ? "Tap the player who won the physical hand."
              : needsChipsToContinue
                ? "Cash game paused. Add chips to keep playing."
                : instruction}
          </span>
          <span className="shrink-0 text-right">
            Small blind {currency(table.smallBlind)} · Big blind {currency(table.bigBlind)}
          </span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-5 gap-1.5" aria-label="Current street">
        {streets.map((street, index) => (
          <div
            className={cn(
              "h-1.5 rounded-full bg-muted transition-[background-color,transform] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none",
              index <= streetIndex && "scale-y-125 bg-primary",
              feedbackPulseClass(lastFeedbackEvent, ["streetAdvance", "dealConfirmed"], "feedback-street"),
            )}
            key={street}
            title={street}
          />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-2 [-webkit-overflow-scrolling:touch]">
        <div className="motion-list grid gap-3">
          {table.players.length < 2 ? (
            <AddPlayerRow
              addPlayer={addPlayer}
              newPlayerName={newPlayerName}
              setNewPlayerName={setNewPlayerName}
            />
          ) : table.awaitingDeal ? (
            <Button className="h-16 text-lg" size="lg" onClick={acknowledgeDeal}>
              Cards are dealt
            </Button>
          ) : table.street === "Showdown" ? (
            table.pot > 0 ? (
              <WinnerList
                lastFeedbackEvent={lastFeedbackEvent}
                players={activePlayers}
                awardPot={awardPot}
                pot={table.pot}
              />
            ) : (
              <div className="grid gap-3">
                {needsChipsToContinue ? (
                  <NeedsChipsPanel
                    addChips={addChips}
                    lastFeedbackEvent={lastFeedbackEvent}
                    players={playersNeedingChips}
                  />
                ) : (
                  <div className="rounded-xl border bg-secondary px-4 py-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Hand complete
                    </p>
                    <p className="mt-1 text-xl font-black">
                      {latestPayout?.label ?? "Pot has been paid"}
                    </p>
                  </div>
                )}
                <Button
                  className="h-16 text-lg"
                  disabled={needsChipsToContinue}
                  size="lg"
                  onClick={nextHand}
                >
                  <RotateCcw aria-hidden="true" />
                  Start next hand
                </Button>
              </div>
            )
          ) : (
            <BettingAction
              applyPlayerAction={applyPlayerAction}
              chipAmount={chipAmount}
              currentPlayer={currentPlayer}
              emitFeedback={emitFeedback}
              lastFeedbackEvent={lastFeedbackEvent}
              setChipAmount={setChipAmount}
              table={table}
              toCall={toCall}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function NeedsChipsPanel({
  addChips,
  lastFeedbackEvent,
  players,
}: {
  addChips: (playerId: string, amount?: number) => void;
  lastFeedbackEvent: FeedbackState | null;
  players: Player[];
}) {
  return (
    <div
      className={cn(
        "motion-panel grid gap-3 rounded-xl border border-destructive/45 bg-destructive/10 p-3",
        feedbackPulseClass(lastFeedbackEvent, ["needsChips", "rebuy"], "feedback-needs-chips"),
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-background text-destructive">
          <PiggyBank aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-destructive">
            Need two funded players
          </p>
          <p className="mt-1 text-lg font-black leading-tight">Add chips to continue</p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            A player needs a top-up before the next cash hand.
          </p>
        </div>
      </div>
      <div className="motion-list grid gap-2">
        {players.map((player, index) => (
          <Button
            className="h-14 justify-between rounded-xl px-4"
            key={player.id}
            style={{ "--motion-delay": `${index * 34}ms` } as CSSProperties}
            type="button"
            variant="secondary"
            onClick={() => addChips(player.id)}
          >
            <span className="text-left">
              <span className="block font-bold">{player.name}</span>
              <span className="block text-xs font-semibold text-muted-foreground">
                Add buy-in {currency(player.buyIn || 100)}
              </span>
            </span>
            <Plus aria-hidden="true" />
          </Button>
        ))}
      </div>
    </div>
  );
}

function BettingAction({
  applyPlayerAction,
  chipAmount,
  currentPlayer,
  emitFeedback,
  lastFeedbackEvent,
  setChipAmount,
  table,
  toCall,
}: {
  applyPlayerAction: (action: "check" | "call" | "fold" | "raise", raiseTo?: number) => void;
  chipAmount: number;
  currentPlayer?: Player;
  emitFeedback: (event: FeedbackEvent, payload?: FeedbackPayload) => void;
  lastFeedbackEvent: FeedbackState | null;
  setChipAmount: Dispatch<SetStateAction<number>>;
  table: TableState;
  toCall: number;
}) {
  const holdRef = useRef<{
    intervalId: number | null;
    timeoutId: number | null;
    startedAt: number;
  }>({ intervalId: null, timeoutId: null, startedAt: 0 });
  const raiseMinimum = Math.max(table.currentBet + table.bigBlind, table.bigBlind);
  const currentContribution = currentPlayer ? table.contributions[currentPlayer.id] ?? 0 : 0;
  const playerAllInTotal = currentPlayer ? currentContribution + currentPlayer.stack : raiseMinimum;
  const maxRaiseTo = currentPlayer
    ? Math.min(playerAllInTotal, maxSinglePotBetTotal(table))
    : raiseMinimum;
  const raiseTo = Math.min(Math.max(chipAmount, raiseMinimum), maxRaiseTo);
  const isAllIn = currentPlayer ? raiseTo >= playerAllInTotal : false;
  const isCappedByEffectiveStack = currentPlayer ? maxRaiseTo < playerAllInTotal : false;
  const canRaise = Boolean(currentPlayer && maxRaiseTo > table.currentBet);
  const chipValues = Array.from(
    new Set(
      [table.smallBlind, table.bigBlind, table.bigBlind * 2, table.bigBlind * 5]
        .filter((amount) => amount > 1)
        .map((amount) => Math.round(amount)),
    ),
  );
  const potRaiseTo = Math.min(
    maxRaiseTo,
    Math.max(raiseMinimum, table.currentBet + table.pot + toCall),
  );

  function setRaiseTo(amount: number, feedbackEvent: FeedbackEvent = "amountStep") {
    const nextAmount = Math.min(Math.max(amount, raiseMinimum), maxRaiseTo);
    if (nextAmount !== raiseTo) {
      emitFeedback(feedbackEvent);
    }
    setChipAmount(nextAmount);
  }

  function stopHold() {
    if (holdRef.current.timeoutId) {
      window.clearTimeout(holdRef.current.timeoutId);
    }
    if (holdRef.current.intervalId) {
      window.clearInterval(holdRef.current.intervalId);
    }
    holdRef.current.timeoutId = null;
    holdRef.current.intervalId = null;
  }

  function holdStep(direction: -1 | 1, elapsedMs: number) {
    const base = Math.max(1, Math.round(table.smallBlind));
    const multiplier = elapsedMs > 2600 ? 20 : elapsedMs > 1800 ? 10 : elapsedMs > 1000 ? 5 : 1;

    setChipAmount((current) => {
      const nextAmount = Math.min(
        Math.max(current + direction * base * multiplier, raiseMinimum),
        maxRaiseTo,
      );
      if (nextAmount !== current) {
        emitFeedback(direction > 0 ? "amountIncrease" : "amountDecrease");
      }
      return nextAmount;
    });
  }

  function startHold(direction: -1 | 1) {
    if (!canRaise) {
      return;
    }

    stopHold();
    holdRef.current.startedAt = window.performance.now();
    holdStep(direction, 0);
    holdRef.current.timeoutId = window.setTimeout(() => {
      holdRef.current.intervalId = window.setInterval(() => {
        holdStep(direction, window.performance.now() - holdRef.current.startedAt);
      }, 110);
    }, 320);
  }

  useEffect(() => stopHold, []);

  return (
    <div className="grid gap-3">
      <div className="motion-panel grid gap-3 rounded-xl border bg-background/35 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Optional raise
            </p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">Total bet would be</p>
            <p className="mt-0.5 text-3xl font-black leading-none">
              <span
                className={cn(
                  "motion-value",
                  feedbackPulseClass(
                    lastFeedbackEvent,
                    [
                      "amountStep",
                      "amountDecrease",
                      "amountIncrease",
                      "amountMinimum",
                      "amountPot",
                      "amountAllIn",
                    ],
                    "feedback-raise",
                  ),
                )}
              >
                <AnimatedNumber value={raiseTo} />
              </span>
            </p>
          </div>
          <div className="text-right text-xs font-semibold text-muted-foreground">
            <p>Minimum total {currency(Math.min(raiseMinimum, maxRaiseTo))}</p>
            <p>
              {isCappedByEffectiveStack ? "Max total" : "All in total"} {currency(maxRaiseTo)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Button
            aria-label={`Lower raise. Hold to decrease faster.`}
            className="size-11 rounded-full"
            disabled={!canRaise || raiseTo <= raiseMinimum}
            type="button"
            variant="outline"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                holdStep(-1, 0);
              }
            }}
            onPointerCancel={stopHold}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              startHold(-1);
            }}
            onPointerLeave={stopHold}
            onPointerUp={stopHold}
          >
            <Minus aria-hidden="true" />
          </Button>
          <div className="motion-list grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-2">
            {chipValues.map((amount, index) => (
              <Button
                aria-label={`Add ${currency(amount)} to raise`}
                className="aspect-square h-auto rounded-full border-2 text-base shadow-sm"
                disabled={!canRaise}
                key={amount}
                style={{ "--motion-delay": `${index * 34}ms` } as CSSProperties}
                type="button"
                variant="outline"
                onClick={() => setRaiseTo(raiseTo + amount, "amountStep")}
              >
                {currency(amount)}
              </Button>
            ))}
          </div>
          <Button
            aria-label={`Increase raise. Hold to increase faster.`}
            className="size-11 rounded-full"
            disabled={!canRaise || raiseTo >= maxRaiseTo}
            type="button"
            variant="outline"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                holdStep(1, 0);
              }
            }}
            onPointerCancel={stopHold}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              startHold(1);
            }}
            onPointerLeave={stopHold}
            onPointerUp={stopHold}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>

        <div className="motion-list grid grid-cols-3 gap-2">
          <Button
            className="h-11 rounded-lg"
            disabled={!canRaise}
            style={{ "--motion-delay": "0ms" } as CSSProperties}
            type="button"
            variant={raiseTo === Math.min(raiseMinimum, maxRaiseTo) ? "default" : "outline"}
            onClick={() => setRaiseTo(raiseMinimum, "amountMinimum")}
          >
            Minimum
          </Button>
          <Button
            className="h-11 rounded-lg"
            disabled={!canRaise}
            style={{ "--motion-delay": "34ms" } as CSSProperties}
            type="button"
            variant={raiseTo === potRaiseTo ? "default" : "outline"}
            onClick={() => setRaiseTo(potRaiseTo, "amountPot")}
          >
            Pot
          </Button>
          <Button
            className="h-11 rounded-lg"
            disabled={!canRaise}
            style={{ "--motion-delay": "68ms" } as CSSProperties}
            type="button"
            variant={raiseTo === maxRaiseTo ? "default" : "outline"}
            onClick={() => setRaiseTo(maxRaiseTo, "amountAllIn")}
          >
            {isCappedByEffectiveStack ? "Max" : "All in"}
          </Button>
        </div>

        <Button
          className="h-14 rounded-xl text-base shadow-md shadow-primary/20"
          disabled={!canRaise}
          variant="default"
          onClick={() => applyPlayerAction("raise", raiseTo)}
        >
          <ArrowUp aria-hidden="true" />
          {isAllIn ? "All in" : "Raise to"} {currency(raiseTo)}
        </Button>
      </div>

      <div className="motion-list grid grid-cols-2 gap-2">
        {toCall > 0 ? (
          <Button
            aria-label={`Call ${currency(
              currentPlayer ? Math.min(toCall, currentPlayer.stack) : toCall,
            )}`}
            className="h-14 rounded-xl text-base"
            disabled={!currentPlayer}
            style={{ "--motion-delay": "0ms" } as CSSProperties}
            size="lg"
            onClick={() => applyPlayerAction("call")}
          >
            <Check aria-hidden="true" />
            {currentPlayer && currentPlayer.stack < toCall ? "Call all in" : "Call"}
          </Button>
        ) : (
          <Button
            className="h-14 rounded-xl text-base"
            disabled={!currentPlayer}
            style={{ "--motion-delay": "0ms" } as CSSProperties}
            size="lg"
            onClick={() => applyPlayerAction("check")}
          >
            <Circle aria-hidden="true" />
            Check
          </Button>
        )}
        <Button
          aria-label="Fold"
          className="h-14 rounded-xl text-base"
          disabled={!currentPlayer}
          style={{ "--motion-delay": "34ms" } as CSSProperties}
          variant="outline"
          onClick={() => applyPlayerAction("fold")}
        >
          <X aria-hidden="true" />
          Fold
        </Button>
      </div>
    </div>
  );
}

function WinnerList({
  awardPot,
  lastFeedbackEvent,
  players,
  pot,
}: {
  awardPot: (playerId: string) => void;
  lastFeedbackEvent: FeedbackState | null;
  players: Player[];
  pot: number;
}) {
  return (
    <div
      className={cn(
        "motion-list grid gap-2",
        feedbackPulseClass(lastFeedbackEvent, ["potAwarded"], "feedback-winners"),
      )}
    >
      {players.map((player, index) => (
        <Button
          className="h-auto min-h-16 justify-between rounded-xl px-4 py-4 text-left"
          key={player.id}
          size="lg"
          style={{ "--motion-delay": `${index * 34}ms` } as CSSProperties}
          variant="secondary"
          onClick={() => awardPot(player.id)}
        >
          <span className="grid gap-0.5">
            <span className="text-lg font-bold">{player.name}</span>
            <span className="text-xs font-semibold text-muted-foreground">Pay {currency(pot)}</span>
          </span>
          <Trophy aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}

function PlayersScreen({
  addChips,
  addPlayer,
  newPlayerName,
  setNewPlayerName,
  table,
  updatePlayer,
}: {
  addChips: (playerId: string, amount?: number) => void;
  addPlayer: () => void;
  newPlayerName: string;
  setNewPlayerName: (value: string) => void;
  table: TableState;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
}) {
  return (
    <section className="screen-panel flex flex-1 flex-col gap-4">
      <AddPlayerRow
        addPlayer={addPlayer}
        newPlayerName={newPlayerName}
        setNewPlayerName={setNewPlayerName}
      />
      <div className="motion-list grid gap-3">
        {table.players.map((player, index) => (
          <PlayerEditor
            addChips={addChips}
            index={index}
            isDealer={index === table.dealerIndex}
            key={player.id}
            player={player}
            style={{ "--motion-delay": `${index * 34}ms` } as CSSProperties}
            updatePlayer={updatePlayer}
          />
        ))}
      </div>
    </section>
  );
}

function SettingsScreen({
  emitFeedback,
  resetTable,
  setTable,
  table,
}: {
  emitFeedback: (event: FeedbackEvent, payload?: FeedbackPayload) => void;
  resetTable: () => void;
  setTable: Dispatch<SetStateAction<TableState>>;
  table: TableState;
}) {
  function updateFeedbackSettings(patch: Partial<FeedbackSettings>) {
    emitFeedback("press");
    setTable((current) => ({
      ...current,
      feedback: {
        ...current.feedback,
        ...patch,
      },
    }));
  }

  return (
    <section className="screen-panel flex min-h-0 flex-1 flex-col justify-between gap-6">
      <div className="motion-list grid min-h-0 gap-4 overflow-y-auto pb-2 [-webkit-overflow-scrolling:touch]">
        <div
          className="motion-surface rounded-xl bg-secondary p-3"
          style={{ "--motion-delay": "0ms" } as CSSProperties}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Appearance
              </p>
              <p className="mt-1 text-lg font-bold">{table.isDark ? "Dark mode" : "Light mode"}</p>
            </div>
            {table.isDark ? (
              <Moon aria-hidden="true" className="size-5 text-muted-foreground" />
            ) : (
              <Sun aria-hidden="true" className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              aria-pressed={!table.isDark}
              className="h-12 rounded-xl"
              variant={!table.isDark ? "default" : "outline"}
              onClick={() => {
                if (table.isDark) {
                  emitFeedback("themeChanged");
                }
                setTable((current) => ({ ...current, isDark: false }));
              }}
            >
              <Sun aria-hidden="true" />
              Light
            </Button>
            <Button
              aria-pressed={table.isDark}
              className="h-12 rounded-xl"
              variant={table.isDark ? "default" : "outline"}
              onClick={() => {
                if (!table.isDark) {
                  emitFeedback("themeChanged");
                }
                setTable((current) => ({ ...current, isDark: true }));
              }}
            >
              <Moon aria-hidden="true" />
              Dark
            </Button>
          </div>
        </div>

        <div
          className="motion-surface rounded-xl bg-secondary p-3"
          style={{ "--motion-delay": "34ms" } as CSSProperties}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Feedback
              </p>
              <p className="mt-1 text-lg font-bold">
                Sound {table.feedback.soundEnabled ? "on" : "off"} · Haptics{" "}
                {table.feedback.hapticsEnabled ? "on" : "off"}
              </p>
            </div>
            {table.feedback.soundEnabled ? (
              <Volume2 aria-hidden="true" className="size-5 text-muted-foreground" />
            ) : (
              <VolumeX aria-hidden="true" className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              aria-pressed={table.feedback.soundEnabled}
              className="h-12 rounded-xl"
              variant={table.feedback.soundEnabled ? "default" : "outline"}
              onClick={() =>
                updateFeedbackSettings({ soundEnabled: !table.feedback.soundEnabled })
              }
            >
              {table.feedback.soundEnabled ? (
                <Volume2 aria-hidden="true" />
              ) : (
                <VolumeX aria-hidden="true" />
              )}
              Sound
            </Button>
            <Button
              aria-pressed={table.feedback.hapticsEnabled}
              className="h-12 rounded-xl"
              variant={table.feedback.hapticsEnabled ? "default" : "outline"}
              onClick={() =>
                updateFeedbackSettings({ hapticsEnabled: !table.feedback.hapticsEnabled })
              }
            >
              <Smartphone aria-hidden="true" />
              Haptics
            </Button>
          </div>
        </div>

        <label
          className="grid gap-2 text-sm font-semibold text-muted-foreground"
          style={{ "--motion-delay": "68ms" } as CSSProperties}
        >
          Small blind
          <Input
            className="h-14 text-xl font-bold"
            inputMode="numeric"
            min={0}
            type="number"
            value={table.smallBlind}
            onChange={(event) =>
              setTable((current) => ({ ...current, smallBlind: Number(event.target.value) }))
            }
          />
        </label>
        <label
          className="grid gap-2 text-sm font-semibold text-muted-foreground"
          style={{ "--motion-delay": "102ms" } as CSSProperties}
        >
          Big blind
          <Input
            className="h-14 text-xl font-bold"
            inputMode="numeric"
            min={0}
            type="number"
            value={table.bigBlind}
            onChange={(event) =>
              setTable((current) => ({ ...current, bigBlind: Number(event.target.value) }))
            }
          />
        </label>
      </div>

      <div className="motion-panel grid gap-3">
        <p className="text-sm leading-6 text-muted-foreground">
          Use the physical deck for every shuffle, burn, and board card. The app handles blinds,
          turns, bets, stacks, pot, and payout.
        </p>
        <Button className="h-14" variant="destructive" onClick={resetTable}>
          Reset table
        </Button>
      </div>
    </section>
  );
}

function HistoryScreen({ table }: { table: TableState }) {
  return (
    <section className="screen-panel flex flex-1 flex-col">
      {table.ledger.length ? (
        <div className="motion-list grid gap-2">
          {table.ledger.map((item, index) => (
            <div
              className="motion-surface flex min-h-14 items-center justify-between rounded-xl bg-secondary px-4 text-sm transition-[background-color,transform] duration-150 ease-[var(--ease-out)] motion-reduce:transition-none"
              key={item.id}
              style={{ "--motion-delay": `${index * 34}ms` } as CSSProperties}
            >
              <span>{item.label}</span>
              <span className="font-bold">{currency(item.amount)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-center text-muted-foreground">
          No chip movement yet.
        </div>
      )}
    </section>
  );
}

function AddPlayerRow({
  addPlayer,
  newPlayerName,
  setNewPlayerName,
}: {
  addPlayer: () => void;
  newPlayerName: string;
  setNewPlayerName: (value: string) => void;
}) {
  return (
    <div className="motion-panel grid grid-cols-[1fr_auto] gap-2">
      <Input
        aria-label="New player name"
        className="h-12 rounded-xl"
        placeholder="Player name"
        value={newPlayerName}
        onChange={(event) => setNewPlayerName(event.target.value)}
      />
      <Button aria-label="Add player" className="h-12 rounded-xl" onClick={addPlayer}>
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}

function PlayerEditor({
  addChips,
  index,
  isDealer,
  player,
  style,
  updatePlayer,
}: {
  addChips: (playerId: string, amount?: number) => void;
  index: number;
  isDealer: boolean;
  player: Player;
  style?: CSSProperties;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
}) {
  const isAllIn = player.inHand && player.stack <= 0;
  const needsChips = !player.inHand && player.stack <= 0;
  const canToggleInHand = player.stack > 0;

  return (
    <div
      className={cn(
        "motion-surface rounded-xl bg-secondary p-3 transition-[background-color,box-shadow,transform] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none",
        isDealer && "ring-2 ring-ring",
        needsChips && "border border-destructive/45 bg-destructive/10",
        isAllIn && "border border-primary/45 bg-primary/10",
      )}
      style={style}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Input
          aria-label={`${player.name} name`}
          className="h-12 rounded-xl bg-background"
          value={player.name}
          onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
        />
        <Button
          aria-label={
            isAllIn
              ? `${player.name} is all in for this hand`
              : needsChips
              ? `${player.name} needs chips before returning to the hand`
              : `${player.inHand ? "Remove" : "Return"} ${player.name} from hand`
          }
          className="rounded-xl"
          disabled={!canToggleInHand}
          size="icon"
          variant={player.inHand ? "default" : "outline"}
          onClick={() => updatePlayer(player.id, { inHand: !player.inHand })}
        >
          {player.inHand ? <Check aria-hidden="true" /> : <UserRound aria-hidden="true" />}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm font-semibold text-muted-foreground">
          Buy-in
          <Input
            className="rounded-xl bg-background"
            inputMode="numeric"
            min={0}
            type="number"
            value={player.buyIn}
            onChange={(event) => updatePlayer(player.id, { buyIn: Number(event.target.value) })}
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-muted-foreground">
          Stack
          <Input
            className="rounded-xl bg-background"
            inputMode="numeric"
            min={0}
            type="number"
            value={player.stack}
            onChange={(event) => updatePlayer(player.id, { stack: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">
          Seat {index + 1}
          {isDealer ? " · Button" : ""}
        </p>
        {needsChips ? (
          <Button
            className="h-11 rounded-xl px-3"
            type="button"
            variant="destructive"
            onClick={() => addChips(player.id)}
          >
            <PiggyBank aria-hidden="true" />
            Add chips
          </Button>
        ) : isAllIn ? (
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
            All in
          </span>
        ) : (
          <span className="rounded-full bg-background px-3 py-1 text-xs font-bold text-muted-foreground">
            {player.inHand ? "Playing" : "Sitting out"}
          </span>
        )}
      </div>
    </div>
  );
}

function BottomNav({
  emitFeedback,
  lastFeedbackEvent,
  pathname,
}: {
  emitFeedback: (event: FeedbackEvent, payload?: FeedbackPayload) => void;
  lastFeedbackEvent: FeedbackState | null;
  pathname: string;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/92 px-3 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1.5 backdrop-blur">
      <div
        className={cn(
          "motion-list mx-auto grid max-w-md grid-cols-4 gap-1",
          feedbackPulseClass(lastFeedbackEvent, ["nav"], "feedback-nav"),
        )}
      >
        {navItems.map((item, index) => {
          const isActive = pathname === item.href;
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              className={cn(
                "grid min-h-12 place-items-center rounded-xl text-muted-foreground transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground",
                isActive && "bg-secondary text-foreground",
              )}
              href={item.href}
              key={item.href}
              onClick={() => {
                if (!isActive) {
                  emitFeedback("nav");
                }
              }}
              style={{ "--motion-delay": `${index * 34}ms` } as CSSProperties}
            >
              <item.icon aria-hidden="true" className="size-5" />
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
