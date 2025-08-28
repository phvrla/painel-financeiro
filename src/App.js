import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, query, doc, deleteDoc } from 'firebase/firestore';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement } from 'chart.js';
import { saveAs } from 'file-saver';

// Registra os componentes necess\u00E1rios para os gr\u00E1ficos
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement);

// O c\u00F3digo abaixo lida com a inicializa\u00E7\u00E3o e autentica\u00E7\u00E3o do Firebase.
// As vari\u00E1veis `__app_id`, `__firebase_config` e `__initial_auth_token`
// s\u00E3o fornecidas pelo ambiente.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Helper para converter data para o formato YYYY-MM-DD
const formatDate = (date) => date.toISOString().split('T')[0];
const formatTime = (date) => date.toTimeString().split(' ')[0].substring(0, 5);

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [sales, setSales] = useState([]);
  const [adCosts, setAdCosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newSale, setNewSale] = useState({
    date: formatDate(new Date()),
    amount: '',
    package: 'Simples',
    origin: 'BR',
    currency: 'Real',
    clientName: '',
  });
  const [newAdCost, setNewAdCost] = useState({
    date: formatDate(new Date()),
    amount: '',
  });
  const [dateRange, setDateRange] = useState({
    startDate: formatDate(new Date()),
    endDate: formatDate(new Date()),
  });

  // Inicializa o Firebase e a autentica\u00E7\u00E3o na montagem do componente.
  useEffect(() => {
    const initFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authInstance = getAuth(app);

        setDb(firestore);
        setAuth(authInstance);

        const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
          if (user) {
            setUserId(user.uid);
            setIsLoading(false);
          } else {
            // Se n\u00E3o houver usu\u00E1rio logado, tenta fazer login com o token ou anonimamente.
            if (initialAuthToken) {
              await signInWithCustomToken(authInstance, initialAuthToken);
            } else {
              await signInAnonymously(authInstance);
            }
          }
        });

        // Limpa o listener ao desmontar o componente.
        return () => unsubscribe();
      } catch (error) {
        console.error("Erro ao inicializar Firebase:", error);
        setIsLoading(false);
      }
    };

    initFirebase();
  }, [initialAuthToken]);

  // Sincroniza os dados do Firestore com o estado local.
  useEffect(() => {
    if (!db || !userId) return;

    try {
      const salesQuery = query(collection(db, `artifacts/${appId}/users/${userId}/sales`));
      const adsQuery = query(collection(db, `artifacts/${appId}/users/${userId}/adCosts`));

      const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
        const salesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          amount: parseFloat(doc.data().amount),
        }));
        setSales(salesData);
      });

      const unsubscribeAds = onSnapshot(adsQuery, (snapshot) => {
        const adsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          amount: parseFloat(doc.data().amount), // Converte para n\u00FAmero
        }));
        setAdCosts(adsData);
      });

      // Limpa os listeners ao desmontar o componente.
      return () => {
        unsubscribeSales();
        unsubscribeAds();
      };
    } catch (error) {
      console.error("Erro ao carregar dados do Firestore:", error);
    }
  }, [db, userId]);

  // Fun\u00E7\u00F5es para adicionar dados ao Firestore
  const handleAddSale = async (e) => {
    e.preventDefault();
    if (!db || !userId) return;

    // Converte de D\u00F3lar para Real para manter a consist\u00EAncia nos c\u00E1lculos
    const saleAmount = parseFloat(newSale.amount) || 0;
    
    const convertedAmount = newSale.currency === 'Dólar' ? saleAmount * 5.0 : saleAmount;

    const dataToSave = {
      ...newSale,
      amount: convertedAmount,
      time: formatTime(new Date()), // Adiciona o hor\u00E1rio atual
      timestamp: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/sales`), dataToSave);
      setNewSale({
        date: formatDate(new Date()),
        amount: '',
        package: 'Simples',
        origin: 'BR',
        currency: 'Real',
        clientName: '',
      });
    } catch (error) {
      console.error("Erro ao adicionar venda:", error);
    }
  };

  const handleAddAdCost = async (e) => {
    e.preventDefault();
    if (!db || !userId) return;
    try {
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/adCosts`), {
        ...newAdCost,
        amount: parseFloat(newAdCost.amount),
        timestamp: new Date().toISOString(),
      });
      setNewAdCost({ date: formatDate(new Date()), amount: '' });
    } catch (error) {
      console.error("Erro ao adicionar custo de Ads:", error);
    }
  };
  
  // Fun\u00E7\u00E3o para deletar uma venda do Firestore
  const handleDeleteSale = async (id) => {
    if (!db || !userId) return;
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/sales`, id));
    } catch (error) {
      console.error("Erro ao deletar venda:", error);
    }
  };

  // Fun\u00E7\u00E3o para deletar um custo de ads do Firestore
  const handleDeleteAdCost = async (id) => {
    if (!db || !userId) return;
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/adCosts`, id));
    } catch (error) {
      console.error("Erro ao deletar custo de ads:", error);
    }
  };

  // Fun\u00E7\u00F5es de filtro e dados para os gr\u00E1ficos
  const filteredSales = useMemo(() => {
    if (!dateRange.startDate && !dateRange.endDate) return sales;
    return sales.filter(s => {
      const saleDate = new Date(s.date);
      const start = dateRange.startDate ? new Date(dateRange.startDate) : null;
      const end = dateRange.endDate ? new Date(dateRange.endDate) : null;
      return (!start || saleDate >= start) && (!end || saleDate <= end);
    });
  }, [sales, dateRange]);

  const filteredAdCosts = useMemo(() => {
    if (!dateRange.startDate && !dateRange.endDate) return adCosts;
    return adCosts.filter(a => {
      const adDate = new Date(a.date);
      const start = dateRange.startDate ? new Date(dateRange.startDate) : null;
      const end = dateRange.endDate ? new Date(dateRange.endDate) : null;
      return (!start || adDate >= start) && (!end || adDate <= end);
    });
  }, [adCosts, dateRange]);

  const filteredTotals = useMemo(() => {
    const revenue = filteredSales.reduce((sum, s) => sum + s.amount, 0);
    const adCost = filteredAdCosts.reduce((sum, a) => sum + a.amount, 0);
    const profit = revenue - adCost;
    const roi = adCost > 0 ? (revenue / adCost).toFixed(2) : 'N/A'; // Calcula o ROI
    return { revenue, adCost, profit, roi };
  }, [filteredSales, filteredAdCosts]);

  const monthlyTotals = useMemo(() => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const monthlySales = sales.filter(s => {
      const saleDate = new Date(s.date);
      return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
    });

    const monthlyAds = adCosts.filter(a => {
      const adDate = new Date(a.date);
      return adDate.getMonth() === currentMonth && adDate.getFullYear() === currentYear;
    });

    const monthlyRevenue = monthlySales.reduce((sum, s) => sum + s.amount, 0);
    const monthlyAdsCost = monthlyAds.reduce((sum, a) => sum + a.amount, 0);
    const monthlyProfit = monthlyRevenue - monthlyAdsCost;

    return { monthlyRevenue, monthlyAdsCost, monthlyProfit };
  }, [sales, adCosts]);

  // Dados para o gr\u00E1fico de linha (Faturamento vs. Custo com Ads)
  const lineChartData = useMemo(() => {
    const allDates = [...new Set([...filteredSales.map(s => s.date), ...filteredAdCosts.map(a => a.date)])].sort();
    const dailyRevenueMap = allDates.reduce((acc, date) => ({ ...acc, [date]: 0 }), {});
    const dailyAdCostMap = allDates.reduce((acc, date) => ({ ...acc, [date]: 0 }), {});

    filteredSales.forEach(s => {
      dailyRevenueMap[s.date] += s.amount;
    });

    filteredAdCosts.forEach(a => {
      dailyAdCostMap[a.date] += a.amount;
    });

    return {
      labels: allDates,
      datasets: [
        {
          label: 'Faturamento',
          data: allDates.map(date => dailyRevenueMap[date]),
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          tension: 0.4,
          pointBackgroundColor: 'rgba(54, 162, 235, 1)',
          pointBorderColor: '#1c1c1e',
        },
        {
          label: 'Custo com Ads',
          data: allDates.map(date => dailyAdCostMap[date]),
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          tension: 0.4,
          pointBackgroundColor: 'rgba(255, 99, 132, 1)',
          pointBorderColor: '#1c1c1e',
        },
      ],
    };
  }, [filteredSales, filteredAdCosts]);

  // Dados para o gr\u00E1fico de barras (Faturamento por Pacote)
  const barChartData = useMemo(() => {
    const packageRevenues = {};
    filteredSales.forEach(s => {
      packageRevenues[s.package] = (packageRevenues[s.package] || 0) + s.amount;
    });
    const labels = Object.keys(packageRevenues);
    const data = labels.map(label => packageRevenues[label]);

    return {
      labels,
      datasets: [{
        label: 'Faturamento por Pacote (R$)',
        data,
        backgroundColor: [
          'rgba(255, 206, 86, 0.8)', // Simples (Amarelo)
          'rgba(210, 105, 30, 0.8)', // Bronze (Marrom)
          'rgba(192, 192, 192, 0.8)', // Prata (Cinza)
          'rgba(255, 215, 0, 0.8)', // Ouro (Dourado)
          'rgba(147, 112, 219, 0.8)', // VIP (Roxo)
          'rgba(255, 99, 132, 0.8)', // Upsell (Rosa)
        ],
        borderColor: '#1c1c1e',
        borderWidth: 1,
      }],
    };
  }, [filteredSales]);

  // Dados para o gr\u00E1fico de pizza (Leads por Origem)
  const pieChartData = useMemo(() => {
    const originCounts = filteredSales.reduce((acc, sale) => {
      acc[sale.origin] = (acc[sale.origin] || 0) + 1;
      return acc;
    }, {});

    const labels = Object.keys(originCounts);
    const data = labels.map(label => originCounts[label]);

    return {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)', // BR (Azul)
          'rgba(255, 159, 64, 0.8)', // USA (Laranja)
        ],
        borderColor: '#1c1c1e',
        borderWidth: 1,
      }],
    };
  }, [filteredSales]);

  // Fun\u00E7\u00F5es para exportar a lista de clientes para CSV
  const exportClientsToCsv = () => {
    const clients = filteredSales.map(s => ({
      'Nome do Cliente': s.clientName,
      'Pacote': s.package,
      'Origem': s.origin,
      'Moeda': s.currency,
      'Valor (R$)': s.amount.toFixed(2),
      'Data da Compra': s.date,
      'Hora da Compra': s.time,
    }));

    if (clients.length === 0) {
      alert("Nenhum cliente para exportar.");
      return;
    }

    const header = Object.keys(clients[0]).join(';');
    const rows = clients.map(client => Object.values(client).join(';'));
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'clientes.csv');
  };

  // Fun\u00E7\u00F5es para exportar o hist\u00F3rico de custos com ads para CSV
  const exportAdCostsToCsv = () => {
    const adCostsToExport = filteredAdCosts.map(a => ({
      'Valor (R$)': a.amount.toFixed(2),
      'Data': a.date,
    }));

    if (adCostsToExport.length === 0) {
      alert("Nenhum custo de Ads para exportar.");
      return;
    }

    const header = Object.keys(adCostsToExport[0]).join(';');
    const rows = adCostsToExport.map(cost => Object.values(cost).join(';'));
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'historico_ads.csv');
  };

  // Fun\u00E7\u00F5es para exportar resumo do per\u00EDodo selecionado para CSV
  const exportFilteredSummaryToCsv = () => {
    if (filteredSales.length === 0 && filteredAdCosts.length === 0) {
      alert("Nenhum dado para exportar no per\u00EDodo selecionado.");
      return;
    }
  
    // Agrupa dados di\u00E1rios
    const dailyDataMap = {};
    const allDates = new Set();
  
    filteredSales.forEach(sale => {
      const date = sale.date;
      allDates.add(date);
      if (!dailyDataMap[date]) dailyDataMap[date] = { revenue: 0, adCost: 0 };
      dailyDataMap[date].revenue += sale.amount;
    });
  
    filteredAdCosts.forEach(adCost => {
      const date = adCost.date;
      allDates.add(date);
      if (!dailyDataMap[date]) dailyDataMap[date] = { revenue: 0, adCost: 0 };
      dailyDataMap[date].adCost += adCost.amount;
    });
  
    const sortedDates = [...allDates].sort();
    const dailySummaryRows = sortedDates.map(date => {
      const data = dailyDataMap[date];
      return `${date};${data.revenue.toFixed(2)};${data.adCost.toFixed(2)}`;
    });
  
    // Agrupa dados mensais
    const monthlyDataMap = {};
    const allMonths = new Set();
  
    filteredSales.forEach(sale => {
      const date = new Date(sale.date);
      const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      allMonths.add(monthYear);
      if (!monthlyDataMap[monthYear]) monthlyDataMap[monthYear] = { revenue: 0, adCost: 0 };
      monthlyDataMap[monthYear].revenue += sale.amount;
    });
  
    filteredAdCosts.forEach(adCost => {
      const date = new Date(adCost.date);
      const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      allMonths.add(monthYear);
      if (!monthlyDataMap[monthYear]) monthlyDataMap[monthYear] = { revenue: 0, adCost: 0 };
      monthlyDataMap[monthYear].adCost += adCost.amount;
    });
  
    const sortedMonths = [...allMonths].sort();
    const monthlySummaryRows = sortedMonths.map(monthYear => {
      const data = monthlyDataMap[monthYear];
      return `${monthYear};${data.revenue.toFixed(2)};${data.adCost.toFixed(2)};${(data.revenue - data.adCost).toFixed(2)};${data.adCost > 0 ? (data.revenue / data.adCost).toFixed(2) : 'N/A'}`;
    });
  
    // Combina os dados em um \u00FAnico CSV
    const csvContent = 
      `Resumo Diário\n` +
      `Data;Faturamento (R$);Custo Ads (R$)\n` +
      dailySummaryRows.join('\n') +
      `\n\nResumo Mensal\n` +
      `Mês;Faturamento (R$);Custo Ads (R$);Lucro (R$);ROI\n` +
      monthlySummaryRows.join('\n');
  
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'resumo_periodo.csv');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-900 text-zinc-200">
        <div className="text-xl font-semibold">Carregando painel...</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 text-zinc-200 min-h-screen p-4 md:p-8 font-sans">
      <style>{`
        body {
          font-family: 'Inter', sans-serif;
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
        }
      `}</style>
      <div className="container mx-auto max-w-7xl">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-teal-400 mb-2 flex items-center justify-center gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-triangle">
              <path d="M13.73 4a2 2 0 0 0-3.46 0l-7.37 12a2 2 0 0 0 1.73 3h14.74a2 2 0 0 0 1.73-3z"/>
            </svg>
            Seu Dashboard Financeiro
          </h1>
          <p className="text-zinc-400 mb-4">
            Gerencie suas vendas, custos e clientes de forma simples e visual.
          </p>
          <div className="text-xs text-zinc-500">
            ID do Usuário: <span className="font-mono">{userId}</span>
          </div>
        </header>

        <main>
          {/* Filtros de data */}
          <div className="flex justify-center mb-8">
            <div className="bg-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-2 border border-zinc-700">
              <h3 className="text-sm font-semibold text-zinc-300">Filtrar por Período:</h3>
              <div className="flex items-center gap-2">
                <label htmlFor="start-date" className="text-xs text-zinc-400">De:</label>
                <input
                  id="start-date"
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                  className="w-full px-2 py-1.5 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-zinc-700 text-zinc-100 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="end-date" className="text-xs text-zinc-400">Até:</label>
                <input
                  id="end-date"
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                  className="w-full px-2 py-1.5 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-zinc-700 text-zinc-100 text-sm"
                />
              </div>
            </div>
          </div>
          
          {/* Métricas do Período */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-teal-400 text-center mb-4">Métricas do Período</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center transform hover:scale-105 transition-transform duration-300 border border-zinc-700">
                <h3 className="text-xl font-bold text-zinc-300">Faturamento</h3>
                <p className="text-3xl font-extrabold text-teal-400 mt-2">
                  R$ {filteredTotals.revenue.toFixed(2)}
                </p>
              </div>
              <div className="bg-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center transform hover:scale-105 transition-transform duration-300 border border-zinc-700">
                <h3 className="text-xl font-bold text-zinc-300">Custo Ads</h3>
                <p className="text-3xl font-extrabold text-red-400 mt-2">
                  R$ {filteredTotals.adCost.toFixed(2)}
                </p>
              </div>
              <div className="bg-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center transform hover:scale-105 transition-transform duration-300 border border-zinc-700">
                <h3 className="text-xl font-bold text-zinc-300">Lucro</h3>
                <p className="text-3xl font-extrabold text-green-400 mt-2">
                  R$ {filteredTotals.profit.toFixed(2)}
                </p>
              </div>
              <div className="bg-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center transform hover:scale-105 transition-transform duration-300 border border-zinc-700">
                <h3 className="text-xl font-bold text-zinc-300">ROI</h3>
                <p className="text-3xl font-extrabold text-zinc-400 mt-2">
                  {filteredTotals.roi}x
                </p>
              </div>
            </div>
          </div>

          {/* Métricas Mensais */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-teal-400 text-center mb-4">Métricas Mensais</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center transform hover:scale-105 transition-transform duration-300 border border-zinc-700">
                <h3 className="text-xl font-bold text-zinc-300">Faturamento Mensal</h3>
                <p className="text-3xl font-extrabold text-teal-400 mt-2">
                  R$ {monthlyTotals.monthlyRevenue.toFixed(2)}
                </p>
              </div>
              <div className="bg-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center transform hover:scale-105 transition-transform duration-300 border border-zinc-700">
                <h3 className="text-xl font-bold text-zinc-300">Custo Ads Mensal</h3>
                <p className="text-3xl font-extrabold text-red-400 mt-2">
                  R$ {monthlyTotals.monthlyAdsCost.toFixed(2)}
                </p>
              </div>
              <div className="bg-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center transform hover:scale-105 transition-transform duration-300 border border-zinc-700">
                <h3 className="text-xl font-bold text-zinc-300">Lucro Mensal</h3>
                <p className="text-3xl font-extrabold text-green-400 mt-2">
                  R$ {monthlyTotals.monthlyProfit.toFixed(2)}
                </p>
              </div>
            </div>
          </div>


          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Formulário de Nova Venda */}
            <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700">
              <h2 className="text-2xl font-bold text-teal-400 mb-4 text-center">Adicionar Nova Venda</h2>
              <form onSubmit={handleAddSale} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Nome do Cliente</label>
                  <input
                    type="text"
                    value={newSale.clientName}
                    onChange={(e) => setNewSale({ ...newSale, clientName: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-zinc-700 text-zinc-100 placeholder-zinc-500"
                    placeholder="Ex: João Silva"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Valor</label>
                  <div className="flex items-center rounded-xl border border-zinc-700 focus-within:ring-2 focus-within:ring-teal-500 bg-zinc-700">
                    <span className="px-3 text-zinc-400">{newSale.currency === 'Real' ? 'R$' : '$'}</span>
                    <input
                      type="number"
                      value={newSale.amount}
                      onChange={(e) => setNewSale({ ...newSale, amount: e.target.value })}
                      required
                      step="0.01"
                      className="flex-1 w-full px-4 py-2 bg-transparent rounded-xl focus:outline-none text-zinc-100 placeholder-zinc-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Moeda</label>
                  <select
                    value={newSale.currency}
                    onChange={(e) => setNewSale({ ...newSale, currency: e.target.value })}
                    className="w-full px-4 py-2 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-zinc-700 text-zinc-100"
                  >
                    <option value="Real">Real (R$)</option>
                    <option value="Dólar">Dólar ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Pacote</label>
                  <select
                    value={newSale.package}
                    onChange={(e) => setNewSale({ ...newSale, package: e.target.value })}
                    className="w-full px-4 py-2 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-zinc-700 text-zinc-100"
                  >
                    <option value="Simples">Simples</option>
                    <option value="Bronze">Bronze</option>
                    <option value="Prata">Prata</option>
                    <option value="Ouro">Ouro</option>
                    <option value="VIP">VIP</option>
                    <option value="Upsell">Upsell</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Origem</label>
                  <select
                    value={newSale.origin}
                    onChange={(e) => setNewSale({ ...newSale, origin: e.target.value })}
                    className="w-full px-4 py-2 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-zinc-700 text-zinc-100"
                  >
                    <option value="BR">Brasil</option>
                    <option value="USA">EUA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Data</label>
                  <input
                    type="date"
                    value={newSale.date}
                    onChange={(e) => setNewSale({ ...newSale, date: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-zinc-700 text-zinc-100"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-teal-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-teal-700 transition-colors duration-300"
                >
                  Salvar Venda
                </button>
              </form>
            </div>

            {/* Formulário de Novo Custo com Ads */}
            <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700">
              <h2 className="text-2xl font-bold text-red-400 mb-4 text-center">Adicionar Custo com Ads</h2>
              <form onSubmit={handleAddAdCost} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    value={newAdCost.amount}
                    onChange={(e) => setNewAdCost({ ...newAdCost, amount: e.target.value })}
                    required
                    step="0.01"
                    className="w-full px-4 py-2 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-zinc-700 text-zinc-100 placeholder-zinc-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Data</label>
                  <input
                    type="date"
                    value={newAdCost.date}
                    onChange={(e) => setNewAdCost({ ...newAdCost, date: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-zinc-700 text-zinc-100"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-red-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-red-700 transition-colors duration-300"
                >
                  Salvar Custo
                </button>
              </form>
            </div>
          </div>

          {/* Seção de Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700">
              <h2 className="text-2xl font-bold text-teal-400 text-center mb-4">Faturamento vs. Custo com Ads</h2>
              <div style={{ height: '300px' }}>
                <Line data={lineChartData} options={{ responsive: true }} />
              </div>
            </div>
            <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700">
              <h2 className="text-2xl font-bold text-teal-400 text-center mb-4">Faturamento por Pacote</h2>
              <div style={{ height: '300px' }}>
                <Bar data={barChartData} options={{ responsive: true }} />
              </div>
            </div>
            <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700">
              <h2 className="text-2xl font-bold text-teal-400 text-center mb-4">Leads por Origem</h2>
              <div style={{ height: '300px' }}>
                <Pie data={pieChartData} options={{ responsive: true }} />
              </div>
            </div>
          </div>

          {/* Seção de Dados e Exportação */}
          <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700 mb-8">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h2 className="text-2xl font-bold text-teal-400">Dados</h2>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={exportClientsToCsv}
                  className="bg-green-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-green-700 transition-colors duration-300"
                >
                  Exportar Clientes (CSV)
                </button>
                <button
                  onClick={exportFilteredSummaryToCsv}
                  className="bg-zinc-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-zinc-700 transition-colors duration-300"
                >
                  Exportar Resumo do Período (CSV)
                </button>
                <button
                  onClick={exportAdCostsToCsv}
                  className="bg-red-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-red-700 transition-colors duration-300"
                >
                  Exportar Ads (CSV)
                </button>
              </div>
            </div>

            {/* Tabela de Vendas */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-zinc-300 mb-2">Histórico de Vendas</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-700 rounded-2xl">
                  <thead className="bg-zinc-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Nome
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Pacote
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Origem
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Valor
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Data e Hora
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-zinc-800 divide-y divide-zinc-700">
                    {filteredSales.map((s, index) => (
                      <tr key={s.id || index} className="hover:bg-zinc-700 transition-colors duration-200">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-200">{s.clientName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">{s.package}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">{s.origin}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">R$ {s.amount.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">{s.date} {s.time}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDeleteSale(s.id)}
                            className="text-red-400 hover:text-red-600 transition-colors duration-200"
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabela de Custos com Ads */}
            <div>
              <h3 className="text-xl font-bold text-red-400 mb-2">Histórico de Custos com Ads</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-700 rounded-2xl">
                  <thead className="bg-zinc-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Valor (R$)
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Data
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-zinc-800 divide-y divide-zinc-700">
                    {filteredAdCosts.map((a, index) => (
                      <tr key={a.id || index} className="hover:bg-zinc-700 transition-colors duration-200">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">R$ {a.amount.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">{a.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDeleteAdCost(a.id)}
                            className="text-red-400 hover:text-red-600 transition-colors duration-200"
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
