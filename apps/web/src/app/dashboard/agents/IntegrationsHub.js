"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IntegrationCard } from "@/app/dashboard/agents/IntegrationCards";
import {
  COLUMN_ORDER,
  columnDisplayName,
  countsActiveConfigured,
  deriveIntegrationStatus,
  sortIntegrationItems,
  STATUS_CHIP_LABEL,
  statusChipClassName,
} from "@/app/dashboard/agents/integrationsHubStatus";

/**
 * @typedef {{ integration: object, providerRow?: object|null }} HubItem
 */

function parseIntegrationHash() {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/^#integration-(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function IntegrationsHub({
  agentId,
  items,
  agentMeta,
  authHeaders,
  onRefresh,
  showManageAllLink = false,
  registryById = {},
  heading = "Integrations",
  subtitle = "Connect this agent to wallets, payments, and on-chain identity.",
}) {
  const [expandedId, setExpandedId] = useState(null);

  const syncHashToExpanded = useCallback(() => {
    const id = parseIntegrationHash();
    setExpandedId(id || null);
  }, []);

  useEffect(() => {
    syncHashToExpanded();
    window.addEventListener("hashchange", syncHashToExpanded);
    return () => window.removeEventListener("hashchange", syncHashToExpanded);
  }, [syncHashToExpanded]);

  useEffect(() => {
    if (!expandedId || typeof window === "undefined") return;
    requestAnimationFrame(() => {
      document.getElementById(`integration-${expandedId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [expandedId]);

  const grouped = useMemo(() => {
    /** @type {Record<string, HubItem[]>} */
    const acc = {};
    for (const key of COLUMN_ORDER) acc[key] = [];

    for (const raw of items) {
      const cat = raw?.integration?.category;
      const bucket = COLUMN_ORDER.includes(cat) ? cat : "Identity";
      acc[bucket].push(raw);
    }

    const getProviderRow = (row) => row.providerRow ?? null;
    const out = {};
    for (const key of COLUMN_ORDER) {
      out[key] = sortIntegrationItems(acc[key], agentMeta, getProviderRow);
    }
    return out;
  }, [items, agentMeta]);

  return (
    <div className="border border-zinc-800 bg-[#0a0a0a]/85 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{heading}</p>
          <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>
        </div>
        {showManageAllLink ? (
          <Link
            href={`/dashboard/agents/${encodeURIComponent(agentId)}/integrations`}
            className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-[#ffb5b3] transition-colors hover:text-white"
          >
            Manage all →
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
        {COLUMN_ORDER.map((columnKey) => {
          const colItems = grouped[columnKey];
          const statuses = colItems.map((row) =>
            deriveIntegrationStatus(row.integration?.id, agentMeta, row.providerRow ?? null)
          );
          const { active, configured } = countsActiveConfigured(statuses);

          return (
            <div key={columnKey} className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
                {columnDisplayName(columnKey)}{" "}
                <span className="font-normal normal-case tracking-normal text-zinc-500">
                  ({active} active / {configured} configured)
                </span>
              </p>

              {colItems.length === 0 ? (
                <p className="mt-4 text-xs text-zinc-500">No integrations in this category.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {colItems.map((row) => {
                    const integ = row.integration;
                    const id = integ.id;
                    const status = deriveIntegrationStatus(id, agentMeta, row.providerRow ?? null);
                    const open = expandedId === id;
                    const label = integ.navLabel || integ.name || id;

                    return (
                      <li key={id} id={`integration-${id}`} className="scroll-mt-28">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : id)}
                          className={`flex w-full items-center justify-between gap-2 border px-3 py-2.5 text-left transition-colors ${
                            open
                              ? "border-[#E53935]/45 bg-[#E53935]/5"
                              : "border-zinc-800 bg-[#090909]/80 hover:border-zinc-600"
                          }`}
                        >
                          <span className="min-w-0 truncate text-xs font-semibold text-zinc-100">{label}</span>
                          <span
                            className={`shrink-0 border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${statusChipClassName(status)}`}
                          >
                            {STATUS_CHIP_LABEL[status]}
                          </span>
                        </button>

                        {open ? (
                          <IntegrationCard
                            integration={integ}
                            providerRow={row.providerRow ?? null}
                            registryById={registryById}
                            agentId={agentId}
                            agentMeta={agentMeta}
                            authHeaders={authHeaders}
                            onRefresh={onRefresh}
                            showHeader={false}
                            variant="embedded"
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
