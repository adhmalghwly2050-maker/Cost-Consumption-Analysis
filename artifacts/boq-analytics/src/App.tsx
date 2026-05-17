import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import Dashboard from "@/pages/Dashboard";
import ImportPage from "@/pages/Import";
import AnalysisPage from "@/pages/Analysis";
import ItemPage from "@/pages/Item";
import StandardPage from "@/pages/Standard";
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
        <Route path="/standard" component={StandardPage} />
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
