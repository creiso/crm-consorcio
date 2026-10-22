"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "../Avatar";
import { siglaEquipe } from "@/lib/sigla";

type Linha = { id: string; nome: string; foto_url: string | null; total: number; qtd: number };
type LinhaEquipe = { id: string; nome: string; total: number; qtd: number; membros: number };
type Equipe = { id: string; nome: string };
type Ultima = {
  id: string; valor: number; tipo: string; created_at: string; cliente: string;
  vendedor: string; foto_url: string | null; equipe: string | null;
};
type Dados = {
  periodo: "mes" | "hoje"; titulo: string; total: number; qtd: number; hojeTotal: number; hojeQtd: number;
  equipe: Equipe | null; equipes: Equipe[]; ranking: Linha[]; equipesRanking: LinhaEquipe[]; ultimas: Ultima[];
};

const ATUALIZA_MS = 15000;
const OCIOSO_MS = 4000;
const LINHAS_LISTA = 5;
const LINHAS_EQUIPES = 5;
const TZ = "America/Sao_Paulo";
const MEDALHA = ["🥇", "🥈", "🥉"];
const TIPO: Record<string, string> = { imovel: "🏠 Imóvel", automovel: "🚗 Automóvel", servicos: "🛠️ Serviços" };
const CONFETE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlCurto = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const cotas = (n: number) => `${n} ${n === 1 ? "cota" : "cotas"}`;
const hora = (d: Date | string) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

// Placar para deixar rodando numa TV: pódio dos vendedores, placar das equipes, últimas vendas
// e comemoração a cada venda nova. O admin escolhe se a TV mostra todas as equipes ou uma só.
export default function Placar({ equipeInicial }: { equipeInicial: string }) {
  const [periodo, setPeriodo] = useState<"mes" | "hoje">("mes");
  const [equipe, setEquipe] = useState(equipeInicial);
  const [dados, setDados] = useState<Dados | null>(null);
  const [offline, setOffline] = useState(false);
  const [festa, setFesta] = useState<Ultima | null>(null);
  const [subiu, setSubiu] = useState<Set<string>>(new Set());
  const [agora, setAgora] = useState<Date | null>(null);
  const [cheia, setCheia] = useState(false);
  const [ocioso, setOcioso] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const filtroRef = useRef({ periodo, equipe });
  const ultimaVenda = useRef<string | null | undefined>(undefined); // undefined = primeira carga
  const posicoes = useRef<Map<string, number>>(new Map());
  const timerOcioso = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    const { periodo: per, equipe: eq } = filtroRef.current;
    const r = await fetch(`/api/placar?periodo=${per}${eq ? `&equipe=${eq}` : ""}`, { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!r || r.error) return setOffline(true);
    setOffline(false);
    const d = r as Dados;

    // venda nova desde a última consulta → comemoração na tela
    const topo = d.ultimas[0]?.id ?? null;
    if (ultimaVenda.current !== undefined && topo && topo !== ultimaVenda.current) {
      setFesta(d.ultimas[0]);
      setTimeout(() => setFesta(null), 9000);
    }
    ultimaVenda.current = topo;

    // vendedor ou equipe que ganhou posição fica marcado por alguns segundos
    const novas = new Map<string, number>([
      ...d.ranking.map((l, i) => [l.id, i] as const),
      ...d.equipesRanking.map((e, i) => [e.id, i] as const),
    ]);
    if (posicoes.current.size) {
      const subiram = [...d.ranking, ...d.equipesRanking]
        .filter((l) => l.total > 0 && (posicoes.current.get(l.id) ?? Infinity) > novas.get(l.id)!)
        .map((l) => l.id);
      if (subiram.length) {
        setSubiu(new Set(subiram));
        setTimeout(() => setSubiu(new Set()), 12000);
      }
    }
    posicoes.current = novas;
    setDados(d);
  }, []);

  useEffect(() => {
    // trocar mês/hoje ou a equipe não conta como "subiu" nem como venda nova
    if (filtroRef.current.equipe !== equipe) ultimaVenda.current = undefined;
    filtroRef.current = { periodo, equipe };
    posicoes.current = new Map();
    load();
  }, [periodo, equipe, load]);

  useEffect(() => {
    const t = setInterval(load, ATUALIZA_MS);
    const relogio = setInterval(() => setAgora(new Date()), 5000);
    setAgora(new Date());
    const tela = () => setCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", tela);
    return () => { clearInterval(t); clearInterval(relogio); document.removeEventListener("fullscreenchange", tela); };
  }, [load]);

  // botões e cursor somem quando ninguém mexe no mouse (modo TV)
  const mexeu = useCallback(() => {
    setOcioso(false);
    clearTimeout(timerOcioso.current);
    timerOcioso.current = setTimeout(() => setOcioso(true), OCIOSO_MS);
  }, []);
  useEffect(() => { mexeu(); return () => clearTimeout(timerOcioso.current); }, [mexeu]);

  function telaCheia() {
    if (document.fullscreenElement) document.exitFullscreen();
    else raiz.current?.requestFullscreen().catch(() => {});
  }

  const rank = dados?.ranking ?? [];
  const podio = rank.filter((l) => l.total > 0).slice(0, 3);
  const resto = rank.slice(podio.length);
  const lista = resto.slice(0, LINHAS_LISTA);
  const lider = podio[0]?.total || 1;
  // ordem visual do pódio: 2º, 1º, 3º
  const degraus = [podio[1] && { l: podio[1], pos: 2 }, podio[0] && { l: podio[0], pos: 1 }, podio[2] && { l: podio[2], pos: 3 }]
    .filter(Boolean) as { l: Linha; pos: number }[];

  const equipesRank = dados?.equipesRanking ?? [];
  const liderEquipes = equipesRank[0]?.total || 1;
  // a coluna da direita divide a altura: quanto mais equipes no placar, menos "últimas vendas" cabem
  const equipesNaTela = Math.min(equipesRank.length, LINHAS_EQUIPES);
  const ultimas = (dados?.ultimas ?? []).slice(0, equipesNaTela ? Math.max(2, 7 - equipesNaTela) : 8);

  return (
    <div ref={raiz} className={`placar ${ocioso ? "ocioso" : ""}`} onMouseMove={mexeu}>
      <header className="pl-topo">
        <div>
          <div className="pl-marca">Placar de vendas</div>
          <div className="pl-sub">
            {dados?.titulo ?? " "}
            {dados?.equipe && <span className="pl-sub-equipe">{dados.equipe.nome}</span>}
          </div>
        </div>
        <div className="pl-total">
          <span>{periodo === "hoje" ? "Vendido hoje" : "Vendido no mês"}</span>
          <strong>{brl(dados?.total ?? 0)}</strong>
          <em>
            {cotas(dados?.qtd ?? 0)}
            {periodo === "mes" && dados ? ` · hoje ${brlCurto(dados.hojeTotal)}` : ""}
          </em>
        </div>
        <div className="pl-dir">
          <div className="pl-relogio">{agora ? hora(agora) : ""}</div>
          <div className={`pl-vivo ${offline ? "off" : ""}`}><i /> {offline ? "reconectando…" : "ao vivo"}</div>
        </div>
      </header>

      <main className="pl-corpo">
        <section className="pl-ranking">
          {rank.length === 0 && dados && <div className="pl-vazio">Nenhum vendedor {dados.equipe ? "nesta equipe" : "cadastrado"} ainda.</div>}
          {rank.length > 0 && podio.length === 0 && (
            <div className="pl-vazio">Ninguém vendeu {periodo === "hoje" ? "hoje" : "neste mês"} ainda.<br />A primeira venda abre o placar! 🚀</div>
          )}
          {podio.length > 0 && (
            <div className="pl-podio">
              {degraus.map(({ l, pos }) => (
                <div key={l.id} className={`pl-degrau p${pos}`}>
                  {subiu.has(l.id) && <span className="pl-subiu">▲ subiu</span>}
                  <div className="pl-foto">
                    <Avatar nome={l.nome} foto={l.foto_url} tamanho={pos === 1 ? "17vh" : "12.5vh"} />
                    <span className="pl-medalha">{MEDALHA[pos - 1]}</span>
                  </div>
                  <div className="pl-nome">{l.nome}</div>
                  <div className="pl-valor">{brl(l.total)}</div>
                  <div className="pl-qtd">{cotas(l.qtd)}</div>
                  <div className="pl-base">{pos}º</div>
                </div>
              ))}
            </div>
          )}
          {lista.length > 0 && (
            <div className="pl-lista">
              {lista.map((l) => {
                const pos = rank.indexOf(l) + 1;
                return (
                  <div key={l.id} className="pl-linha">
                    <span className="pl-pos">{pos}º</span>
                    <Avatar nome={l.nome} foto={l.foto_url} tamanho="4.6vh" />
                    <div className="pl-linha-meio">
                      <div className="pl-linha-nome">
                        {l.nome}
                        {subiu.has(l.id) && <span className="pl-subiu mini">▲</span>}
                      </div>
                      <div className="pl-trilho">{l.total > 0 && <div className="pl-barra" style={{ width: `${(l.total / lider) * 100}%` }} />}</div>
                    </div>
                    <span className="pl-linha-valor">{brl(l.total)}</span>
                    <span className="pl-linha-qtd">{cotas(l.qtd)}</span>
                  </div>
                );
              })}
              {resto.length > lista.length && <div className="pl-mais">+{resto.length - lista.length} vendedores</div>}
            </div>
          )}
        </section>

        <aside className="pl-lateral">
          {equipesRank.length > 0 && (
            <section className="pl-card pl-equipes">
              <h2>Placar das equipes</h2>
              {equipesRank.slice(0, LINHAS_EQUIPES).map((e, i) => (
                <div key={e.id} className={`pl-eq ${dados?.equipe?.id === e.id ? "minha" : ""}`}>
                  <span className="pl-eq-pos">{e.total > 0 && i < 3 ? MEDALHA[i] : `${i + 1}º`}</span>
                  <span className="pl-eq-badge">{siglaEquipe(e.nome)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="pl-eq-nome">
                      {e.nome}
                      {subiu.has(e.id) && <span className="pl-subiu mini">▲</span>}
                    </div>
                    <div className="pl-trilho">{e.total > 0 && <div className="pl-barra" style={{ width: `${(e.total / liderEquipes) * 100}%` }} />}</div>
                  </div>
                  <div className="pl-eq-valor">{brlCurto(e.total)}<small>{cotas(e.qtd)}</small></div>
                </div>
              ))}
              {equipesRank.length > LINHAS_EQUIPES && <div className="pl-mais">+{equipesRank.length - LINHAS_EQUIPES} equipes</div>}
            </section>
          )}

          <section className="pl-card pl-ultimas">
            <h2>Últimas vendas</h2>
            {dados && ultimas.length === 0 && <div className="pl-vazio mini">As vendas aparecem aqui assim que forem registradas.</div>}
            {ultimas.map((v, i) => (
              <div key={v.id} className={`pl-venda ${i === 0 ? "nova" : ""}`}>
                <Avatar nome={v.vendedor} foto={v.foto_url} tamanho="6vh" />
                <div style={{ minWidth: 0 }}>
                  <div className="pl-venda-nome">{v.vendedor}</div>
                  <div className="pl-venda-det">{TIPO[v.tipo] ?? "📄"} · {v.cliente} · {hora(v.created_at)}</div>
                </div>
                <div className="pl-venda-valor">{brlCurto(v.valor)}</div>
              </div>
            ))}
          </section>
        </aside>
      </main>

      <div className="pl-controles">
        <div className="pl-seg">
          <button className={`pl-btn ${periodo === "mes" ? "on" : ""}`} onClick={() => setPeriodo("mes")}>Mês</button>
          <button className={`pl-btn ${periodo === "hoje" ? "on" : ""}`} onClick={() => setPeriodo("hoje")}>Hoje</button>
        </div>
        {dados && dados.equipes.length > 0 && (
          <select className="pl-select" value={equipe} onChange={(e) => setEquipe(e.target.value)} aria-label="Equipe da TV">
            <option value="">Todas as equipes</option>
            {dados.equipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        )}
        <button className="pl-btn" onClick={telaCheia}>{cheia ? "Sair da tela cheia" : "⛶ Tela cheia"}</button>
        {!cheia && <Link className="pl-btn" href="/">← Dashboard</Link>}
      </div>

      {festa && (
        <div className="pl-festa" role="alert">
          <div className="pl-confete" aria-hidden>
            {Array.from({ length: 70 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 14) * 0.18}s`, background: CONFETE[i % CONFETE.length] }} />
            ))}
          </div>
          <div className="pl-festa-card">
            <div className="pl-festa-tit">🎉 Nova venda!</div>
            <Avatar nome={festa.vendedor} foto={festa.foto_url} tamanho="24vh" />
            <div className="pl-festa-nome">{festa.vendedor}</div>
            {festa.equipe && <div className="pl-festa-equipe">{festa.equipe}</div>}
            <div className="pl-festa-valor">{brl(festa.valor)}</div>
            <div className="pl-festa-det">{TIPO[festa.tipo] ?? "📄"} · cliente {festa.cliente}</div>
          </div>
        </div>
      )}
    </div>
  );
}
