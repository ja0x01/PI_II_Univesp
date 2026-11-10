const API_URL = window.APP_CONFIG?.API_URL || 'http://127.0.0.1:8080/graphql';
const NOMES_MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const MESES_CURTOS = [
    'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
    'jul', 'ago', 'set', 'out', 'nov', 'dez'
];

let parlamentares = [];
let parlamentarAtual = null;
let graficoCategorias = null;
let requisicaoAtual = 0;
let resumoAtual = [];
let estatisticasAtuais = null;

document.addEventListener('DOMContentLoaded', iniciarBuscaDespesas);

async function gql(query) {
    const resposta = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    if (!resposta.ok) {
        throw new Error(await resposta.text());
    }

    const resultado = await resposta.json();

    if (resultado.errors && resultado.errors.length > 0) {
        throw new Error(resultado.errors[0].message);
    }

    return resultado.data;
}

function escaparHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizar(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor || 0);
}

function preencherMeses() {
    const inicio = document.getElementById('mes-inicio');
    const fim = document.getElementById('mes-fim');

    NOMES_MESES.forEach((nome, indice) => {
        const valor = String(indice + 1);
        inicio.add(new Option(nome, valor));
        fim.add(new Option(nome, valor));
    });

    inicio.value = '1';
    fim.value = '12';
}

function ajustarPeriodo(origem) {
    const inicio = document.getElementById('mes-inicio');
    const fim = document.getElementById('mes-fim');

    if (Number(inicio.value) <= Number(fim.value)) return;

    if (origem === 'inicio') {
        fim.value = inicio.value;
    } else {
        inicio.value = fim.value;
    }
}

function lerPeriodo() {
    const inicio = Number(document.getElementById('mes-inicio').value) || 1;
    const fim = Number(document.getElementById('mes-fim').value) || 12;

    return { inicio, fim };
}

async function iniciarBuscaDespesas() {
    const campo = document.getElementById('campo-busca');
    const lista = document.getElementById('lista-suspensa');
    const status = document.getElementById('status-api');

    campo.addEventListener('focus', () => mostrarParlamentares(campo.value));
    campo.addEventListener('input', () => mostrarParlamentares(campo.value));

    document.addEventListener('click', (evento) => {
        if (!evento.target.closest('.caixa-busca')) {
            lista.classList.remove('aberta');
        }
    });

    preencherMeses();

    document.getElementById('mes-inicio').addEventListener('change', () => {
        ajustarPeriodo('inicio');
        carregarResumoDespesas();
    });

    document.getElementById('mes-fim').addEventListener('change', () => {
        ajustarPeriodo('fim');
        carregarResumoDespesas();
    });

    document.getElementById('modo-valor').addEventListener('change', renderizarResumo);

    status.textContent = 'Carregando parlamentares...';
    status.style.color = '#b7791f';

    try {
        const tamanhoPagina = 50;

        for (let pagina = 0; pagina < 30; pagina++) {
            const resultado = await gql(`{
                parlamentares(limit: ${tamanhoPagina}, offset: ${pagina * tamanhoPagina}) {
                    id_parlamentar
                    casa
                    nome_referencia
                }
            }`);

            const lote = resultado.parlamentares || [];
            parlamentares = parlamentares.concat(lote);

            if (lote.length < tamanhoPagina) {
                break;
            }
        }

        parlamentares.sort((a, b) =>
            String(a.nome_referencia || '').localeCompare(
                String(b.nome_referencia || ''),
                'pt-BR'
            )
        );

        status.textContent = `${parlamentares.length} parlamentares carregados`;
        status.style.color = '#168a5b';
    } catch (erro) {
        console.error('Erro ao carregar parlamentares:', erro);
        status.textContent = 'Erro ao carregar parlamentares. Verifique a conexão com a API.';
        status.style.color = '#c0392b';
    }
}

function mostrarParlamentares(termo) {
    const lista = document.getElementById('lista-suspensa');
    const filtro = normalizar(termo);

    const encontrados = parlamentares
        .filter((parlamentar) =>
            normalizar(parlamentar.nome_referencia).includes(filtro)
        )
        .slice(0, 200);

    lista.innerHTML = '';

    if (encontrados.length === 0) {
        lista.innerHTML =
            '<div class="mensagem-lista">Nenhum parlamentar encontrado.</div>';
    } else {
        encontrados.forEach((parlamentar) => {
            const opcao = document.createElement('div');
            opcao.className = 'opcao';

            opcao.innerHTML = `
                ${escaparHTML(
                    parlamentar.nome_referencia ||
                    `Parlamentar ${parlamentar.id_parlamentar}`
                )}
                <span>${escaparHTML(parlamentar.casa || '')}</span>
            `;

            opcao.addEventListener('click', () => selecionarParlamentar(parlamentar));
            lista.appendChild(opcao);
        });
    }

    lista.classList.add('aberta');
}

function selecionarParlamentar(parlamentar) {
    parlamentarAtual = parlamentar;
    resumoAtual = [];
    estatisticasAtuais = null;

    document.getElementById('campo-busca').value =
        parlamentar.nome_referencia || '';

    document.getElementById('lista-suspensa').classList.remove('aberta');
    document.getElementById('area-despesas').hidden = false;
    document.getElementById('titulo-despesas').textContent =
        `2. Despesas de ${parlamentar.nome_referencia || 'parlamentar'}`;

    document.getElementById('lista-categorias').innerHTML = '';
    document.getElementById('mensagem-despesas').textContent = '';
    document.getElementById('sub-despesas').textContent = '';
    document.getElementById('grafico-container').hidden = false;

    if (graficoCategorias) {
        graficoCategorias.destroy();
        graficoCategorias = null;
    }

    carregarResumoDespesas();
}

async function carregarResumoDespesas() {
    if (!parlamentarAtual) return;

    const requisicao = ++requisicaoAtual;

    const status = document.getElementById('status-api');
    const subtitulo = document.getElementById('sub-despesas');
    const { inicio, fim } = lerPeriodo();

    status.textContent = 'Carregando despesas...';
    status.style.color = '#b7791f';
    subtitulo.textContent = 'Buscando despesas e categorias...';

    try {
        const resultado = await gql(`{
            resumoDespesas(
                id: ${JSON.stringify(String(parlamentarAtual.id_parlamentar))},
                casa: ${JSON.stringify(String(parlamentarAtual.casa))},
                mes_inicio: ${inicio},
                mes_fim: ${fim}
            ) {
                categoria
                quantidade
                total
            }
            estatisticasDespesas(
                id: ${JSON.stringify(String(parlamentarAtual.id_parlamentar))},
                casa: ${JSON.stringify(String(parlamentarAtual.casa))},
                mes_inicio: ${inicio},
                mes_fim: ${fim}
            ) {
                total_despesas
                total_liquido
                meses_com_despesas
                ano_inicio
                ano_fim
                media_mensal
            }
        }`);

        if (requisicao !== requisicaoAtual) return;

        resumoAtual = resultado.resumoDespesas || [];
        estatisticasAtuais = resultado.estatisticasDespesas || null;

        if (resumoAtual.length === 0) {
            document.getElementById('grafico-container').hidden = true;
            document.getElementById('mensagem-despesas').textContent =
                `Não há despesas registradas para ${parlamentarAtual.nome_referencia || 'este parlamentar'} no período selecionado (${MESES_CURTOS[inicio - 1]} a ${MESES_CURTOS[fim - 1]}).`;
            subtitulo.textContent = 'Nenhuma despesa encontrada.';
            status.textContent = 'Busca concluída';
            status.style.color = '#4b5563';
            return;
        }

        document.getElementById('grafico-container').hidden = false;

        renderizarResumo();

        status.textContent = 'Despesas carregadas';
        status.style.color = '#168a5b';
        const anoInicio = estatisticasAtuais.ano_inicio;
        const anoFim = estatisticasAtuais.ano_fim;
        const anoTexto = anoInicio > 0
            ? (anoInicio === anoFim ? `${anoInicio}` : `${anoInicio}–${anoFim}`)
            : '';
        const sufixoAno = anoTexto ? ` de ${anoTexto}` : '';
        subtitulo.textContent =
            `${estatisticasAtuais.total_despesas} despesa(s) encontrada(s) para ${parlamentarAtual.nome_referencia} • período: ${MESES_CURTOS[inicio - 1]} a ${MESES_CURTOS[fim - 1]}${sufixoAno}.`;
    } catch (erro) {
        if (requisicao !== requisicaoAtual) return;

        console.error('Erro ao carregar despesas:', erro);
        status.textContent = 'Erro ao carregar despesas';
        status.style.color = '#c0392b';
        subtitulo.textContent = `Não foi possível carregar as despesas: ${erro.message}`;
    }
}

function renderizarResumo() {
    if (!resumoAtual.length || !estatisticasAtuais) return;

    const modo = document.getElementById('modo-valor').value;
    const meses = Number(estatisticasAtuais.meses_com_despesas) || 0;
    const divisor = modo === 'media' && meses > 0 ? meses : 1;

    const categorias = resumoAtual
        .map((item) => [
            item.categoria || 'Categoria não informada',
            (Number(item.total) || 0) / divisor
        ])
        .sort((a, b) => b[1] - a[1]);

    const totalGeral = categorias.reduce((soma, item) => soma + item[1], 0);

    const modoTexto = modo === 'media'
        ? 'Gráfico: média mensal por categoria'
        : 'Gráfico: total do período por categoria';

    document.getElementById('mensagem-despesas').textContent = [
        modoTexto,
        `total do período: ${formatarMoeda(estatisticasAtuais.total_liquido)}`,
        `${estatisticasAtuais.total_despesas} despesa(s)`,
        `${meses} mês(es) com despesas`,
        `média mensal: ${formatarMoeda(estatisticasAtuais.media_mensal)}`
    ].join(' • ');

    desenharGrafico(categorias);
    desenharListaCategorias(categorias, totalGeral);
}

function desenharGrafico(categorias) {
    const canvas = document.getElementById('grafico-categorias');

    if (graficoCategorias) {
        graficoCategorias.destroy();
    }

    if (!categorias.length) return;

    graficoCategorias = new Chart(canvas, {
        type: 'pie',
        data: {
            labels: categorias.map(([categoria]) => categoria),
            datasets: [{
                data: categorias.map(([, valor]) => valor),
                backgroundColor: [
                    '#0b2545',
                    '#00b4d8',
                    '#168a5b',
                    '#13315c',
                    '#48cae4',
                    '#1d4e89',
                    '#22a06b',
                    '#0077b6',
                    '#5ec2a0',
                    '#0096c7'
                ],
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const valor = Number(context.raw) || 0;
                            return `${context.label}: ${formatarMoeda(valor)}`;
                        }
                    }
                }
            }
        }
    });
}

function desenharListaCategorias(categorias, totalGeral) {
    const lista = document.getElementById('lista-categorias');
    lista.innerHTML = '';

    categorias.forEach(([categoria, valor]) => {
        const percentual = totalGeral > 0
            ? ((valor / totalGeral) * 100).toFixed(1)
            : '0.0';

        const item = document.createElement('div');
        item.className = 'item-categoria';
        item.innerHTML = `
            <strong>${escaparHTML(categoria)} — ${percentual}%</strong>
            <span>${formatarMoeda(valor)}</span>
        `;

        lista.appendChild(item);
    });
}
