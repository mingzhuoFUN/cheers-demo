import type { Metadata } from "next";
import "../ui/cheers-ui.css";
export const metadata: Metadata = { title: "干杯！｜聚会游戏", description: "把手机放在中间，选择今晚要玩的游戏。" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
