/**
 * Golang 安全知识库 - 主页面
 * 包含洞察漏洞库和攻击模式库两个 Tab
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Bug, Swords, BookMarked } from 'lucide-react';
import VulnerabilityList from './security-kb/VulnerabilityList';
import AttackPatternList from './security-kb/AttackPatternList';
import BusinessKbList from './security-kb/BusinessKbList';

export default function SecurityKnowledgeBase() {
  const [activeTab, setActiveTab] = useState('vulnerabilities');

  const tabCls = "data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 px-4 text-muted-foreground transition-all rounded-sm text-xs flex items-center gap-2";

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      <div className="cyber-card p-0 relative z-10">
        <div className="cyber-card-header">
          <BookOpen className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold uppercase tracking-wider text-foreground">安全知识库</h1>
          <p className="text-xs text-muted-foreground font-normal ml-1">Golang Security Knowledge Base</p>
        </div>
      </div>

      <div className="relative z-10">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-fit bg-muted border border-border p-1 h-auto gap-1 rounded mb-5">
            <TabsTrigger value="vulnerabilities" className={tabCls}>
              <Bug className="w-4 h-4" />
              漏洞洞察报告
            </TabsTrigger>
            <TabsTrigger value="attack-patterns" className={tabCls}>
              <Swords className="w-4 h-4" />
              攻击模式库
            </TabsTrigger>
            <TabsTrigger value="business-kb" className={tabCls}>
              <BookMarked className="w-4 h-4" />
              业务知识库
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vulnerabilities">
            <VulnerabilityList />
          </TabsContent>

          <TabsContent value="attack-patterns">
            <AttackPatternList />
          </TabsContent>

          <TabsContent value="business-kb">
            <BusinessKbList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
