import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ThemeToggle from "@/components/ThemeToggle";
import Index from "./pages/Index";
import Samples from "./pages/Samples";
import ArchiveContents from "./pages/ArchiveContents";
import Viewer from "./pages/Viewer";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename="/apps/spectra">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route
              path="/samples"
              element={
                <ProtectedRoute>
                  <Samples />
                </ProtectedRoute>
              }
            />
            <Route
              path="/archive/:sampleId"
              element={
                <ProtectedRoute>
                  <ArchiveContents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/viewer/:sampleId"
              element={
                <ProtectedRoute>
                  <Viewer />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <div className="fixed bottom-4 right-4 z-30">
          <ThemeToggle />
        </div>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
