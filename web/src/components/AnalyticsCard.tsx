"use client";

import React, { forwardRef, useMemo } from "react";
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

export interface AnalyticsData {
    type: "bar" | "line" | "pie" | "area";
    title: string;
    labels: string[];
    data: number[];
    insight: string;
    showTotal?: boolean;
}

interface AnalyticsCardProps {
    data: AnalyticsData;
}

// 💎 LIQUID CRYSTAL PALETTE (HEX ONLY for html2canvas)
const COLORS = {
    bgDark: "#020617",       // Slate-950 (Canvas Safe)
    bgGlass: "rgba(255, 255, 255, 0.02)", // Simulated Glass
    borderGlass: "rgba(255, 255, 255, 0.1)",
    textHero: "#f8fafc",     // Slate-50
    textMuted: "#94a3b8",    // Slate-400
    cyan: "#06b6d4",         // Cyan-500
    cyanGlow: "#22d3ee",     // Cyan-400
    emerald: "#10b981",      // Emerald-500
    emeraldGlow: "#34d399",  // Emerald-400
    purple: "#8b5cf6",       // Violet-500
    rose: "#f43f5e",         // Rose-500
    grid: "#334155",         // Slate-700
};

const PIE_COLORS = [COLORS.cyan, COLORS.emerald, COLORS.purple, COLORS.rose, "#f59e0b"];

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div
                style={{
                    backgroundColor: "rgba(15, 23, 42, 0.95)",
                    border: `1px solid ${COLORS.borderGlass}`,
                    borderRadius: "12px",
                    padding: "12px 16px",
                    boxShadow: "0 10px 40px -10px rgba(0,0,0,0.5)",
                    direction: "rtl", // Support Arabic dates/labels
                    fontFamily: "'Tajawal', sans-serif"
                }}
            >
                <p style={{ color: COLORS.textMuted, fontSize: "12px", marginBottom: "4px" }}>
                    {label}
                </p>
                <p style={{ color: COLORS.cyanGlow, fontWeight: "800", fontSize: "20px", fontFamily: "monospace" }}>
                    {payload[0].value.toLocaleString()}
                </p>
            </div>
        );
    }
    return null;
};

export const AnalyticsCard = forwardRef<HTMLDivElement, AnalyticsCardProps>(
    function AnalyticsCard({ data }, ref) {
        // Safety Check
        if (!data || !data.labels || !data.data) {
            return (
                <div ref={ref} style={{ width: "800px", height: "600px", background: COLORS.bgDark, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.rose }}>
                    ⚠️ INVALID DATA
                </div>
            );
        }

        // 🧠 SMART CONTEXT LOGIC
        const stats = useMemo(() => {
            const total = data.data.reduce((sum, val) => sum + val, 0);
            const max = Math.max(...data.data);
            const maxIndex = data.data.indexOf(max);
            const maxLabel = data.labels[maxIndex] || "";
            const avg = total / data.data.length;

            // Auto-detect "Comparison" mode vs "Trend" mode
            const isComparison = data.showTotal === false || /Top|Best|Vs/.test(data.title);

            return { total, max, maxLabel, avg, isComparison };
        }, [data]);

        const chartData = data.labels.map((label, index) => ({
            name: label,
            value: data.data[index] || 0,
            isMax: data.data[index] === stats.max // Flag for "Winner" styling
        }));

        const renderChart = () => {
            // CHART RENDER LOGIC
            // Using responsive containers but constrained by parent flex
            switch (data.type) {
                case "pie":
                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={110}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {chartData.map((_, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                                            style={{ outline: 'none' }}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ color: COLORS.textMuted, fontFamily: "'Tajawal', sans-serif" }} />
                            </PieChart>
                        </ResponsiveContainer>
                    );

                case "bar":
                default:
                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} barSize={40} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                <defs>
                                    <linearGradient id="neonBar" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={COLORS.emeraldGlow} stopOpacity={1} />
                                        <stop offset="100%" stopColor="#064e3b" stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="neonBarMax" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={COLORS.cyanGlow} stopOpacity={1} />
                                        <stop offset="100%" stopColor="#083344" stopOpacity={0.6} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} opacity={0.4} />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: "'Tajawal', sans-serif" }}
                                    interval={0}
                                    angle={-20} // ROTATE
                                    textAnchor="end"
                                    height={60}
                                    axisLine={false}
                                    tickLine={false}
                                    dy={5}
                                />
                                <YAxis
                                    tick={{ fill: "#64748b", fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(value) => value > 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.isMax ? "url(#neonBarMax)" : "url(#neonBar)"}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    );
            }
        };

        return (
            <div
                id="analytics-card-render"
                ref={ref}
                style={{
                    width: "800px",
                    height: "600px",
                    position: "relative",
                    overflow: "hidden",
                    // 1. VISUAL FIX: CANVAS SAFE GRADIENT
                    background: `linear-gradient(to bottom right, ${COLORS.bgDark}, #1e293b)`,
                    fontFamily: "'Tajawal', sans-serif",
                    padding: "32px",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {/* 2. ARABIC FONT INJECTION */}
                <style>{`
                    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');
                    * { letter-spacing: 0px !important; } 
                `}</style>

                {/* Background Glow Orbs */}
                <div style={{ position: 'absolute', top: 0, right: 0, width: '400px', height: '400px', background: 'rgba(16, 185, 129, 0.15)', filter: 'blur(80px)', borderRadius: '50%', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: '300px', height: '300px', background: 'rgba(6, 182, 212, 0.1)', filter: 'blur(80px)', borderRadius: '50%', pointerEvents: 'none' }} />

                {/* HEADER SECTION */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', zIndex: 10, direction: "rtl" }}>
                    <div style={{ textAlign: "right" }}>
                        <h2 style={{
                            fontSize: '32px', fontWeight: 'bold', margin: '0 0 8px 0',
                            background: `linear-gradient(to right, ${COLORS.emeraldGlow}, ${COLORS.cyanGlow})`,
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            filter: "drop-shadow(0 0 20px rgba(16, 185, 129, 0.3))"
                        }}>
                            {data.title}
                        </h2>

                        {/* Dynamic Badge or Total */}
                        {!stats.isComparison && (
                            <div style={{ fontSize: '48px', fontWeight: 'bold', color: COLORS.textHero, lineHeight: 1 }}>
                                {stats.total.toLocaleString()}
                            </div>
                        )}
                        {stats.isComparison && (
                            <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: "100px", background: "rgba(16, 185, 129, 0.2)", border: `1px solid ${COLORS.emerald}`, color: COLORS.emeraldGlow, fontSize: "14px", fontWeight: "bold" }}>
                                {stats.maxLabel}: {stats.max.toLocaleString()}
                            </div>
                        )}
                    </div>

                    <div style={{ textAlign: "left", opacity: 0.8 }}>
                        <div style={{ fontSize: "12px", color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "2px" }}>PEAK</div>
                        <div style={{ fontSize: "20px", fontWeight: "bold", color: COLORS.cyanGlow }}>{stats.maxLabel}</div>
                    </div>
                </div>

                {/* CHART CONTAINER (GLASS BOX) */}
                <div style={{
                    flex: 1,
                    position: "relative",
                    borderRadius: "24px",
                    border: `1px solid ${COLORS.borderGlass}`,
                    background: "rgba(255,255,255,0.02)", // Canvas-safe glass
                    boxShadow: "inset 0 0 30px rgba(0,0,0,0.5)",
                    padding: "20px",
                    zIndex: 10,
                    minHeight: 0 // Flexbox safety
                }}>
                    {renderChart()}
                </div>

                {/* FOOTER INSIGHT (SEPARATE BLOCK) */}
                <div style={{
                    marginTop: "24px",
                    padding: "20px",
                    borderRadius: "16px",
                    borderRight: `4px solid ${COLORS.emerald}`, // Right border for RTL aesthetic
                    background: "rgba(16, 185, 129, 0.05)",
                    zIndex: 10,
                    direction: "rtl"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", color: COLORS.emeraldGlow, fontWeight: "bold", fontSize: "12px", letterSpacing: "1px" }}>
                        <span>⚡ AI ANALYSIS</span>
                    </div>
                    <p style={{ margin: 0, color: COLORS.textHero, fontSize: "14px", lineHeight: "1.6", fontWeight: "500", fontFamily: "'Tajawal', sans-serif" }}>
                        {data.insight}
                    </p>
                </div>

                {/* WATERMARK */}
                <div style={{ position: 'absolute', bottom: '15px', left: '20px', fontSize: '10px', color: 'rgba(255,255,255,0.1)', letterSpacing: '2px', fontWeight: 'bold' }}>
                    NEXUS ANALYTICS
                </div>
            </div>
        );
    }
);
