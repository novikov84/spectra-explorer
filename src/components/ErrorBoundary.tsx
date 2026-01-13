import React, { Component, ErrorInfo, ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-screen w-full items-center justify-center bg-background p-4">
                    <Alert variant="destructive" className="max-w-lg">
                        <AlertTitle>Something went wrong</AlertTitle>
                        <AlertDescription className="mt-2 text-sm">
                            {this.state.error?.message}
                        </AlertDescription>
                        <Button
                            className="mt-4"
                            onClick={() => this.setState({ hasError: false, error: null })}
                        >
                            Try again
                        </Button>
                    </Alert>
                </div>
            );
        }

        return this.props.children;
    }
}
