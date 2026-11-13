/**
 * Kanalnamen für Live-Signale (Push). Die Signale enthalten KEINE Inhalte –
 * nur „hier hat sich etwas geändert“. Der Browser holt die Daten danach
 * selbst und mit voller Rechteprüfung vom Server. Interne Vorgänge (interne
 * Notizen, Kommentare, Abstimmungen) gehen nur auf die `-team`-Kanäle.
 */
export const teamTicketsChannel = "nvs-team-tickets";
export const teamRequestsChannel = "nvs-team-requests";
export const ticketChannel = (id: string) => `nvs-t-${id}`;
export const ticketTeamChannel = (id: string) => `nvs-t-${id}-team`;
export const requestChannel = (id: string) => `nvs-r-${id}`;
export const requestTeamChannel = (id: string) => `nvs-r-${id}-team`;

export type LiveChannelScope =
  | { type: "ticket" | "request"; id: string; perspective: "player" | "team" }
  | { type: "team-tickets" }
  | { type: "team-requests" };

/** Welche Kanäle eine Seite abonniert */
export function liveChannels(scope: LiveChannelScope): string[] {
  switch (scope.type) {
    case "ticket":
      return scope.perspective === "team" ? [ticketChannel(scope.id), ticketTeamChannel(scope.id)] : [ticketChannel(scope.id)];
    case "request":
      return scope.perspective === "team" ? [requestChannel(scope.id), requestTeamChannel(scope.id)] : [requestChannel(scope.id)];
    case "team-tickets":
      return [teamTicketsChannel];
    case "team-requests":
      return [teamRequestsChannel];
  }
}

export const LIVE_EVENT = "changed";
