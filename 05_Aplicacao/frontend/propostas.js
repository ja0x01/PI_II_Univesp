const API_URL = window.APP_CONFIG?.API_URL || 'http://127.0.0.1:8080/graphql';
const LIMITE = 20;

let parlamentares = [];
let atual = null;
let offset = 0;
let situacaoRequisicao = 0;

document.addEventListener('DOMContentLoaded', iniciar);

async function gql(query) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    if (json.errors && json.errors.length) throw new Error(json.errors[0].message);
    return json.data;
}

function esc(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '&quot;');
}

function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function formatarData(data) {
    if (!data) return 'data não informada';

    const texto = String(data);
    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        return `${iso[3]}/${iso[2]}/${iso[1]}`;
    }

    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return 'data não informada';
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function rotuloProposta(pr) {
    const tipo = pr.sigla_tipo || 'Proposta';
    const numero = pr.numero;
    const ano = pr.ano;

    if (numero != null && ano != null) return `${tipo} ${numero}/${ano}`;
    if (numero != null) return `${tipo} ${numero}`;
    if (ano != null) return `${tipo} s/n/${ano}`;
    return `${tipo} s/n`;
}

async function iniciar() {
    const campo = document.getElementById('campo-busca');
    const lista = document.getElementById('lista-suspensa');
    const status = document.getElementById('status-api');

    iniciarModal();

    document.getElementById('filtro-votadas').addEventListener('change', () => {
        if (atual) carregarPropostas(true);
    });

    campo.addEventListener('focus', () => mostrarOpcoes(campo.value));
    campo.addEventListener('input', () => mostrarOpcoes(campo.value));
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.caixa-busca')) lista.classList.remove('aberta');
    });
    document.getElementById('btn-mais').addEventListener('click', () => carregarPropostas(false));

    status.textContent = 'Carregando parlamentares...';
    status.style.color = '#b7791f';

    try {
        const tamanho = 50;
        for (let pagina = 0; pagina < 30; pagina++) {
            const data = await gql(`{
                parlamentares(limit: ${tamanho}, offset: ${pagina * tamanho}) {
                    id_parlamentar
                    casa
                    nome_referencia
                }
            }`);
            const lote = data.parlamentares || [];
            parlamentares = parlamentares.concat(lote);
            if (lote.length < tamanho) break;
        }

        parlamentares.sort((a, b) =>
            String(a.nome_referencia || '').localeCompare(String(b.nome_referencia || ''), 'pt-BR'));

        status.textContent = `${parlamentares.length} parlamentares carregados`;
        status.style.color = '#168a5b';
    } catch (e) {
        console.error(e);
        status.textContent = 'Erro ao carregar parlamentares. Pressione F12.';
        status.style.color = '#c0392b';
    }
}

function mostrarOpcoes(termo) {
    const lista = document.getElementById('lista-suspensa');
    const filtro = normalizar(termo);
    const achados = parlamentares
        .filter((p) => normalizar(p.nome_referencia).includes(filtro))
        .slice(0, 200);

    lista.innerHTML = '';

    if (achados.length === 0) {
        lista.innerHTML = '<div class="carregando">Nenhum parlamentar encontrado.</div>';
    } else {
        achados.forEach((p) => {
            const div = document.createElement('div');
            div.className = 'opcao';
            div.innerHTML = `${esc(p.nome_referencia || 'Parlamentar ' + p.id_parlamentar)}<span>${esc(p.casa || '')}</span>`;
            div.addEventListener('click', () => selecionar(p));
            lista.appendChild(div);
        });
    }
    lista.classList.add('aberta');
}

function selecionar(p) {
    atual = p;
    document.getElementById('campo-busca').value = p.nome_referencia || '';
    document.getElementById('lista-suspensa').classList.remove('aberta');
    document.getElementById('area-propostas').hidden = false;
    document.getElementById('titulo-propostas').textContent = `2. Propostas de autoria de ${p.nome_referencia || ''}`;
    carregarPropostas(true);
}

async function carregarPropostas(reiniciar) {
    const area = document.getElementById('lista-propostas');
    const sub = document.getElementById('sub-propostas');
    const btn = document.getElementById('btn-mais');
    const apenasVotadas = document.getElementById('filtro-votadas').checked;

    if (!atual) return;

    if (reiniciar) {
        offset = 0;
        area.innerHTML = '';
    }

    sub.textContent = 'Carregando propostas...';
    btn.hidden = true;

    try {
        const data = await gql(`{
            atividade(
                id: ${JSON.stringify(String(atual.id_parlamentar))},
                limit: ${LIMITE},
                offset: ${offset},
                somente_votadas: ${apenasVotadas}
            ) {
                casa
                id_proposicao
                sigla_tipo
                numero
                ano
                ementa
                data_apresentacao
                tem_votacao
            }
        }`);

        const propostas = data.atividade || [];

        if (propostas.length === 0 && offset === 0) {
            sub.textContent = apenasVotadas
                ? 'Nenhuma proposta votada encontrada para este parlamentar nos dados disponíveis.'
                : 'Nenhuma proposta de autoria encontrada para este parlamentar nos dados disponíveis.';
            return;
        }

        propostas.forEach((pr) => {
            const ementa = pr.ementa || 'Sem ementa disponível';
            const resumo = ementa.length > 220 ? ementa.slice(0, 220) + '...' : ementa;
            const seloVotada = pr.tem_votacao
                ? '<span class="badge-votada">Votada</span>'
                : '';

            const div = document.createElement('div');
            div.className = 'item-ranking';
            div.innerHTML = `
                <div class="info-politico">
                    <strong>${esc(rotuloProposta(pr))}${seloVotada}</strong>
                    <span>${esc(pr.casa)} - apresentada em ${esc(formatarData(pr.data_apresentacao))}</span>
                    <span class="descricao">${esc(resumo)}</span>
                    <span style="color:#0096c7;">Clique para ver os detalhes</span>
                </div>`;
            div.addEventListener('click', () => abrirDetalhes(pr));
            area.appendChild(div);
        });

        offset += propostas.length;
        sub.textContent = apenasVotadas
            ? `${offset} proposta(s) votada(s) exibida(s). Clique em uma para ver os detalhes.`
            : `${offset} proposta(s) exibida(s). Clique em uma para ver os detalhes.`;

        if (propostas.length === LIMITE) btn.hidden = false;
    } catch (e) {
        console.error(e);
        sub.textContent = `Erro ao carregar propostas: ${e.message}`;
    }
}

function iniciarModal() {
    const modal = document.getElementById('modal-proposta');
    document.getElementById('modal-fechar').addEventListener('click', fecharModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) fecharModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fecharModal();
    });
}

function abrirDetalhes(pr) {
    document.getElementById('modal-titulo').textContent = rotuloProposta(pr);

    document.getElementById('modal-corpo').innerHTML = `
        <div class="modal-info">${esc(pr.casa)} - apresentada em ${esc(formatarData(pr.data_apresentacao))}</div>
        <h4>Autor principal</h4>
        <p class="modal-texto">${esc(atual ? atual.nome_referencia : 'Não informado')}</p>
        <h4>Situação</h4>
        <div id="modal-situacao" class="modal-situacao">
            <p class="modal-texto">Consultando a situação...</p>
        </div>
        <h4>Ementa</h4>
        <p class="modal-texto">${esc(pr.ementa || 'Sem ementa disponível')}</p>
        <div class="modal-aviso">
            O texto integral não está disponível nos dados atuais.
            Consulte a proposta nas fontes oficiais da Câmara ou do Senado.
        </div>`;

    const requisicao = ++situacaoRequisicao;
    document.getElementById('modal-proposta').classList.add('aberto');
    carregarSituacao(pr, requisicao);
}

async function carregarSituacao(pr, requisicao) {
    try {
        const data = await gql(`{
            votacoes_da_proposicao(
                casa: ${JSON.stringify(String(pr.casa))},
                id_proposicao: ${JSON.stringify(String(pr.id_proposicao))}
            ) {
                data_votacao
                sigla_orgao
                aprovacao
                descricao
                votos_sim
                votos_nao
                votos_outros
            }
        }`);

        if (requisicao !== situacaoRequisicao) return;

        const alvo = document.getElementById('modal-situacao');
        if (!alvo) return;

        alvo.innerHTML = renderizarVotacoes(data.votacoes_da_proposicao || []);
    } catch (erro) {
        if (requisicao !== situacaoRequisicao) return;

        console.error('Erro ao carregar situação da proposta:', erro);
        const alvo = document.getElementById('modal-situacao');
        if (alvo) {
            alvo.innerHTML = '<p class="modal-texto">Não foi possível consultar a situação desta proposta.</p>';
        }
    }
}

function renderizarVotacoes(votacoes) {
    if (!votacoes.length) {
        return `
            <p class="modal-texto">Não há votação registrada para esta proposta nos dados disponíveis.</p>
            <p class="modal-texto modal-texto-secundario">
                A aprovação pode ter ocorrido por despacho ou em uma etapa não registrada como votação.
            </p>
        `;
    }

    const itens = votacoes.map((votacao) => {
        let status = 'Resultado não informado';
        let classeStatus = 'status-neutro';
        let classeItem = '';

        if (votacao.aprovacao === true) {
            status = 'Aprovada na votação';
            classeStatus = 'status-aprovada';
            classeItem = 'votacao-aprovada';
        } else if (votacao.aprovacao === false) {
            status = 'Rejeitada na votação';
            classeStatus = 'status-rejeitada';
            classeItem = 'votacao-rejeitada';
        }

        const meta = [
            formatarData(votacao.data_votacao),
            votacao.sigla_orgao
        ].filter(Boolean).map(esc).join(' • ');

        const votos = [];
        if (votacao.votos_sim != null) votos.push(`Sim: ${votacao.votos_sim}`);
        if (votacao.votos_nao != null) votos.push(`Não: ${votacao.votos_nao}`);
        if (votacao.votos_outros != null) votos.push(`Outros: ${votacao.votos_outros}`);

        return `
            <div class="votacao-item ${classeItem}">
                <span class="status-votacao ${classeStatus}">${esc(status)}</span>
                <div class="votacao-meta">${meta}</div>
                ${votacao.descricao ? `<p class="votacao-descricao">${esc(votacao.descricao)}</p>` : ''}
                ${votos.length ? `<div class="votacao-votos">${votos.map(esc).join(' • ')}</div>` : ''}
            </div>
        `;
    }).join('');

    return `<div class="lista-votacoes">${itens}</div>`;
}

function fecharModal() {
    situacaoRequisicao++;
    document.getElementById('modal-proposta').classList.remove('aberto');
}
