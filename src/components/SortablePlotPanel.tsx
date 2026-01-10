import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SortablePlotPanelProps {
    id: string;
    children: React.ReactNode;
}

export function SortablePlotPanel({ id, children }: SortablePlotPanelProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 1,
        position: 'relative' as const,
    };

    return (
        <div ref={setNodeRef} style={style} className="group relative">
            <div
                {...attributes}
                {...listeners}
                className="absolute left-2 top-4 z-20 cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity"
                title="Drag to reorder"
            >
                <GripVertical className="w-4 h-4" />
            </div>
            <div className="pl-6">
                {children}
            </div>
        </div>
    );
}
