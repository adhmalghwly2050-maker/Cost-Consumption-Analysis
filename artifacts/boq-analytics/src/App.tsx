import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import Dashboard from "@/pages/Dashboard";
import ImportPage from "@/pages/Import";
import AnalysisPage from "@/pages/Analysis";
import ItemPage from "@/pages/Item";
import AdaptivePage from "@/pages/Adaptive";
import OverAllocReportPage from "@/pages/OverAllocReport";
import StandardPage from "@/pages/Standard";
import ProjectContextPage from "@/pages/ProjectContext";
import WorkflowPage from "@/pages/RecommendationsWorkflow";
import StandardEvolutionPage from "@/pages/StandardEvolution";
import DataGovernancePage from "@/pages/DataGovernance";
import StabilityReportPage from "@/pages/StabilityReport";
import VolatilityReportPage from "@/pages/VolatilityReport";
import MaterialHubPage from "@/pages/MaterialHub";
import MaterialDictionaryPage from "@/pages/MaterialDictionary";
import MaterialForecastPage from "@/pages/MaterialForecast";
import MaterialHistoricalPage from "@/pages/MaterialHistorical";
import MaterialReportsPage from "@/pages/MaterialReports";
import ElementRolesPage from "@/pages/ElementRoles";
import UnexecutedReportPage from "@/pages/UnexecutedReport";
import ItemComparisonPage from "@/pages/ItemComparison";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/import" component={ImportPage} />
        <Route path="/analysis" component={AnalysisPage} />
        <Route path="/item" component={ItemPage} />
        <Route path="/adaptive" component={AdaptivePage} />
        <Route path="/overalloc" component={OverAllocReportPage} />
        <Route path="/standard" component={StandardPage} />
        <Route path="/project-context" component={ProjectContextPage} />
        <Route path="/workflow" component={WorkflowPage} />
        <Route path="/standard-evolution" component={StandardEvolutionPage} />
        <Route path="/data-governance" component={DataGovernancePage} />
        <Route path="/stability-report" component={StabilityReportPage} />
        <Route path="/volatility-report" component={VolatilityReportPage} />
        <Route path="/material-hub" component={MaterialHubPage} />
        <Route path="/material-dictionary" component={MaterialDictionaryPage} />
        <Route path="/material-forecast" component={MaterialForecastPage} />
        <Route path="/material-historical" component={MaterialHistoricalPage} />
        <Route path="/material-reports" component={MaterialReportsPage} />
        <Route path="/element-roles" component={ElementRolesPage} />
        <Route path="/unexecuted-report" component={UnexecutedReportPage} />
        <Route path="/item-comparison" component={ItemComparisonPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster position="bottom-center" richColors />
    </QueryClientProvider>
  );
}
