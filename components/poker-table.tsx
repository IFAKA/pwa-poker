"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Circle,
  CircleDollarSign,
  Clock3,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Settings,
  Sun,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
};

const STORAGE_KEY = "table-stakes-state-v2";
const streets: Street[] = ["Preflop", "Flop", "Turn", "River", "Showdown"];

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

function getBlindIndexes(dealerIndex: number, playerCount: number) {
  if (playerCount <= 1) {
    return { smallBlindIndex: dealerIndex, bigBlindIndex: dealerIndex };
  }

  if (playerCount === 2) {
    return {
      smallBlindIndex: dealerIndex,
      bigBlindIndex: rotateIndex(dealerIndex, playerCount, 1),
    };
  }

  return {
    smallBlindIndex: rotateIndex(dealerIndex, playerCount, 1),
    bigBlindIndex: rotateIndex(dealerIndex, playerCount, 2),
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
    } as TableState;
  } catch {
    return initialState;
  }
}

function nextActiveIndex(players: Player[], fromIndex: number) {
  if (!players.length) {
    return 0;
  }

  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = rotateIndex(fromIndex, players.length, offset);
    if (players[index]?.inHand && players[index].stack >= 0) {
      return index;
    }
  }

  return fromIndex;
}

function firstToActIndex(players: Player[], dealerIndex: number, street: Street) {
  if (players.length <= 2) {
    return street === "Preflop"
      ? dealerIndex
      : rotateIndex(dealerIndex, players.length, 1);
  }

  return street === "Preflop"
    ? rotateIndex(dealerIndex, players.length, 3)
    : rotateIndex(dealerIndex, players.length, 1);
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

  return contenders.every((player) => {
    const contribution = state.contributions[player.id] ?? 0;
    return (
      player.stack === 0 ||
      (state.actedPlayerIds.includes(player.id) && contribution === state.currentBet)
    );
  });
}

function nextStreetAfter(street: Street) {
  if (street === "Preflop") return "Flop";
  if (street === "Flop") return "Turn";
  if (street === "Turn") return "River";
  return "Showdown";
}

export function PokerTable({ screen = "table" }: { screen?: Screen }) {
  const pathname = usePathname();
  const [table, setTable] = useState<TableState>(initialState);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [chipAmount, setChipAmount] = useState(4);

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
      return `Put in ${currency(toCall)} more to stay in`;
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
      players: current.players.map((player) =>
        player.id === id ? { ...player, ...patch } : player,
      ),
    }));
  }

  function addPlayer() {
    const name = newPlayerName.trim() || `Player ${table.players.length + 1}`;
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
      return;
    }

    setTable((current) => {
      const currentActor = current.players[current.currentPlayerIndex];
      if (!currentActor) {
        return current;
      }

      const previousContribution = current.contributions[currentActor.id] ?? 0;
      const owed = Math.max(0, current.currentBet - previousContribution);
      const targetBet = action === "raise" ? Math.max(raiseTo ?? current.bigBlind, current.currentBet + current.bigBlind) : current.currentBet;
      const amount =
        action === "fold"
          ? 0
          : action === "raise"
            ? Math.min(Math.max(0, targetBet - previousContribution), currentActor.stack)
            : Math.min(owed, currentActor.stack);
      const totalContribution = previousContribution + amount;
      const nextCurrentBet = action === "raise" ? Math.max(current.currentBet, totalContribution) : current.currentBet;

      const nextState: TableState = {
        ...current,
        currentBet: nextCurrentBet,
        pot: current.pot + amount,
        contributions: {
          ...current.contributions,
          [currentActor.id]: totalContribution,
        },
        actedPlayerIds:
          action === "raise"
            ? [currentActor.id]
            : Array.from(new Set([...current.actedPlayerIds, currentActor.id])),
        ledger: [
          {
            id: nextId(),
            label:
              action === "fold"
                ? `${currentActor.name} folds`
                : action === "check"
                  ? `${currentActor.name} checks`
                  : action === "call"
                    ? `${currentActor.name} calls ${currency(amount)}`
                    : `${currentActor.name} raises to ${currency(totalContribution)}`,
            amount,
          },
          ...current.ledger.slice(0, 10),
        ],
        players: current.players.map((player) =>
          player.id === currentActor.id
            ? {
                ...player,
                inHand: action === "fold" ? false : player.inHand,
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
      return;
    }

    setTable((current) => ({
      ...current,
      ledger: [
        { id: nextId(), label: `${winner.name} wins ${currency(current.pot)}`, amount: current.pot },
        ...current.ledger.slice(0, 10),
      ],
      players: current.players.map((player) =>
        player.id === playerId ? { ...player, stack: player.stack + current.pot } : player,
      ),
      pot: 0,
      street: "Showdown",
    }));
  }

  function nextHand() {
    setTable((current) => {
      const dealerIndex = rotateIndex(current.dealerIndex, current.players.length, 1);
      const { smallBlindIndex: nextSmallBlindIndex, bigBlindIndex: nextBigBlindIndex } =
        getBlindIndexes(dealerIndex, current.players.length);
      let pot = 0;
      const contributions: Record<string, number> = {};
      const players = current.players.map((player, index) => {
        const blind =
          index === nextSmallBlindIndex
            ? current.smallBlind
            : index === nextBigBlindIndex
              ? current.bigBlind
              : 0;
        const paid = Math.min(blind, player.stack);
        if (paid > 0) {
          pot += paid;
          contributions[player.id] = paid;
        }
        return {
          ...player,
          stack: Math.max(0, player.stack - paid),
          inHand: player.stack > 0,
        };
      });

      return {
        ...current,
        players,
        dealerIndex,
        postedSmallBlind: true,
        postedBigBlind: true,
        currentBet: current.bigBlind,
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
    });
  }

  function resetTable() {
    setTable(initialState);
  }

  return (
    <main className="min-h-svh overflow-hidden bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+68px)] pt-[calc(env(safe-area-inset-top)+8px)] text-foreground">
      <div className="mx-auto flex h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-76px)] w-full max-w-md flex-col overflow-hidden">
        <TopBar
          pathname={pathname}
          screen={screen}
        />

        {screen === "table" ? (
          <HandScreen
            activePlayers={activePlayers}
            addPlayer={addPlayer}
            acknowledgeDeal={() => setTable((current) => ({ ...current, awaitingDeal: false }))}
            applyPlayerAction={applyPlayerAction}
            awardPot={awardPot}
            chipAmount={chipAmount}
            currentPlayer={currentPlayer}
            instruction={instruction}
            newPlayerName={newPlayerName}
            nextHand={nextHand}
            setChipAmount={setChipAmount}
            setNewPlayerName={setNewPlayerName}
            streetIndex={streetIndex}
            table={table}
            toCall={toCall}
          />
        ) : null}

        {screen === "players" ? (
          <PlayersScreen
            addPlayer={addPlayer}
            newPlayerName={newPlayerName}
            setNewPlayerName={setNewPlayerName}
            table={table}
            updatePlayer={updatePlayer}
          />
        ) : null}

        {screen === "history" ? <HistoryScreen table={table} /> : null}

        {screen === "settings" ? (
          <SettingsScreen resetTable={resetTable} setTable={setTable} table={table} />
        ) : null}
      </div>
      <BottomNav pathname={pathname} />
    </main>
  );
}

function TopBar({
  pathname,
  screen,
}: {
  pathname: string;
  screen: Screen;
}) {
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
    <header className="mb-4 flex min-h-12 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1">
        {pathname !== "/" ? (
          <Button aria-label="Back to current hand" asChild size="icon" variant="ghost">
            <Link href="/">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
        <h1 className="truncate text-[34px] font-bold leading-none">{title}</h1>
      </div>
      <div className="size-11" aria-hidden="true" />
    </header>
  );
}

function HandScreen({
  activePlayers,
  addPlayer,
  acknowledgeDeal,
  applyPlayerAction,
  awardPot,
  chipAmount,
  currentPlayer,
  instruction,
  newPlayerName,
  nextHand,
  setChipAmount,
  setNewPlayerName,
  streetIndex,
  table,
  toCall,
}: {
  activePlayers: Player[];
  addPlayer: () => void;
  acknowledgeDeal: () => void;
  applyPlayerAction: (action: "check" | "call" | "fold" | "raise", raiseTo?: number) => void;
  awardPot: (playerId: string) => void;
  chipAmount: number;
  currentPlayer?: Player;
  instruction: string;
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
  const latestPayout = table.ledger.find((item) => item.label.includes(" wins "));
  const statusLabel = needsWinner
    ? "Choose winner"
    : isShowdown
      ? "Pot paid"
      : currentPlayer
        ? `${currentPlayer.name}'s turn`
        : "Player turn";

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className={cn("mb-2 rounded-xl bg-secondary px-4 py-3", needsWinner && "bg-primary/10")}>
        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Hand {table.handNumber} · {table.street}
            </p>
            <p
              className={cn(
                "mt-1 inline-block max-w-full truncate rounded-lg border-2 px-2.5 py-1 text-2xl font-black leading-none shadow-[2px_2px_0_#000] transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none",
                needsWinner
                  ? "border-black bg-primary text-primary-foreground"
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
            <p className="text-3xl font-black leading-none">{currency(table.pot)}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
          <span>
            {needsWinner ? "Tap the player who won the physical hand." : instruction}
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
            )}
            key={street}
            title={street}
          />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-2 [-webkit-overflow-scrolling:touch]">
        <div className="grid gap-3">
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
              <WinnerList players={activePlayers} awardPot={awardPot} pot={table.pot} />
            ) : (
              <div className="grid gap-3">
                <div className="rounded-xl border bg-secondary px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Hand complete
                  </p>
                  <p className="mt-1 text-xl font-black">
                    {latestPayout?.label ?? "Pot has been paid"}
                  </p>
                </div>
                <Button className="h-16 text-lg" size="lg" onClick={nextHand}>
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

function BettingAction({
  applyPlayerAction,
  chipAmount,
  currentPlayer,
  setChipAmount,
  table,
  toCall,
}: {
  applyPlayerAction: (action: "check" | "call" | "fold" | "raise", raiseTo?: number) => void;
  chipAmount: number;
  currentPlayer?: Player;
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
  const maxRaiseTo = currentPlayer ? currentContribution + currentPlayer.stack : raiseMinimum;
  const raiseTo = Math.min(Math.max(chipAmount, raiseMinimum), maxRaiseTo);
  const isAllIn = currentPlayer ? raiseTo >= maxRaiseTo : false;
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

  function setRaiseTo(amount: number) {
    setChipAmount(Math.min(Math.max(amount, raiseMinimum), maxRaiseTo));
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

    setChipAmount((current) =>
      Math.min(Math.max(current + direction * base * multiplier, raiseMinimum), maxRaiseTo),
    );
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
      <div className="grid gap-3 rounded-xl border bg-background/35 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Optional raise
            </p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">Total bet would be</p>
            <p className="mt-0.5 text-3xl font-black leading-none">{currency(raiseTo)}</p>
          </div>
          <div className="text-right text-xs font-semibold text-muted-foreground">
            <p>Minimum total {currency(Math.min(raiseMinimum, maxRaiseTo))}</p>
            <p>All in total {currency(maxRaiseTo)}</p>
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
          <div className="grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-2">
            {chipValues.map((amount) => (
              <Button
                aria-label={`Add ${currency(amount)} to raise`}
                className="aspect-square h-auto rounded-full border-2 text-base shadow-sm"
                disabled={!canRaise}
                key={amount}
                type="button"
                variant="outline"
                onClick={() => setRaiseTo(raiseTo + amount)}
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

        <div className="grid grid-cols-3 gap-2">
          <Button
            className="h-11 rounded-lg"
            disabled={!canRaise}
            type="button"
            variant={raiseTo === Math.min(raiseMinimum, maxRaiseTo) ? "default" : "outline"}
            onClick={() => setRaiseTo(raiseMinimum)}
          >
            Minimum
          </Button>
          <Button
            className="h-11 rounded-lg"
            disabled={!canRaise}
            type="button"
            variant={raiseTo === potRaiseTo ? "default" : "outline"}
            onClick={() => setRaiseTo(potRaiseTo)}
          >
            Pot
          </Button>
          <Button
            className="h-11 rounded-lg"
            disabled={!canRaise}
            type="button"
            variant={isAllIn ? "default" : "outline"}
            onClick={() => setRaiseTo(maxRaiseTo)}
          >
            All in
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

      <div className="grid grid-cols-2 gap-2">
        {toCall > 0 ? (
          <Button
            aria-label={`Call ${currency(toCall)}`}
            className="h-14 rounded-xl text-base"
            disabled={!currentPlayer}
            size="lg"
            onClick={() => applyPlayerAction("call")}
          >
            <Check aria-hidden="true" />
            Call
          </Button>
        ) : (
          <Button
            className="h-14 rounded-xl text-base"
            disabled={!currentPlayer}
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
  players,
  pot,
}: {
  awardPot: (playerId: string) => void;
  players: Player[];
  pot: number;
}) {
  return (
    <div className="grid gap-2">
      {players.map((player) => (
        <Button
          className="h-auto min-h-16 justify-between rounded-xl px-4 py-4 text-left"
          key={player.id}
          size="lg"
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
  addPlayer,
  newPlayerName,
  setNewPlayerName,
  table,
  updatePlayer,
}: {
  addPlayer: () => void;
  newPlayerName: string;
  setNewPlayerName: (value: string) => void;
  table: TableState;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
}) {
  return (
    <section className="flex flex-1 flex-col gap-4">
      <AddPlayerRow
        addPlayer={addPlayer}
        newPlayerName={newPlayerName}
        setNewPlayerName={setNewPlayerName}
      />
      <div className="grid gap-3">
        {table.players.map((player, index) => (
          <PlayerEditor
            index={index}
            isDealer={index === table.dealerIndex}
            key={player.id}
            player={player}
            updatePlayer={updatePlayer}
          />
        ))}
      </div>
    </section>
  );
}

function SettingsScreen({
  resetTable,
  setTable,
  table,
}: {
  resetTable: () => void;
  setTable: Dispatch<SetStateAction<TableState>>;
  table: TableState;
}) {
  return (
    <section className="flex flex-1 flex-col justify-between gap-6">
      <div className="grid gap-4">
        <div className="rounded-xl bg-secondary p-3">
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
              onClick={() => setTable((current) => ({ ...current, isDark: false }))}
            >
              <Sun aria-hidden="true" />
              Light
            </Button>
            <Button
              aria-pressed={table.isDark}
              className="h-12 rounded-xl"
              variant={table.isDark ? "default" : "outline"}
              onClick={() => setTable((current) => ({ ...current, isDark: true }))}
            >
              <Moon aria-hidden="true" />
              Dark
            </Button>
          </div>
        </div>

        <label className="grid gap-2 text-sm font-semibold text-muted-foreground">
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
        <label className="grid gap-2 text-sm font-semibold text-muted-foreground">
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

      <div className="grid gap-3">
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
    <section className="flex flex-1 flex-col">
      {table.ledger.length ? (
        <div className="grid gap-2">
          {table.ledger.map((item) => (
            <div
              className="flex min-h-14 items-center justify-between rounded-xl bg-secondary px-4 text-sm transition-[background-color,transform] duration-150 ease-[var(--ease-out)] motion-reduce:transition-none"
              key={item.id}
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
    <div className="grid grid-cols-[1fr_auto] gap-2">
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
  index,
  isDealer,
  player,
  updatePlayer,
}: {
  index: number;
  isDealer: boolean;
  player: Player;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-secondary p-3 transition-[background-color,box-shadow] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none",
        isDealer && "ring-2 ring-ring",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Input
          aria-label={`${player.name} name`}
          className="h-12 rounded-xl bg-background"
          value={player.name}
          onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
        />
        <Button
          aria-label={`${player.inHand ? "Remove" : "Return"} ${player.name} from hand`}
          className="rounded-xl"
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
      <p className="mt-3 text-sm font-semibold text-muted-foreground">
        Seat {index + 1}
        {isDealer ? " · Button" : ""}
      </p>
    </div>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/92 px-3 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1.5 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {navItems.map((item) => {
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
