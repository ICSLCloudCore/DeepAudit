/**
 * Golang 安全知识库 - 主页面
 * 包含洞察漏洞库和攻击模式库两个 Tab
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Bug, Swords } from 'lucide-react';
import VulnerabilityList from './security-kb/VulnerabilityList';
import AttackPatternList from './security-kb/AttackPatternList';

export default function SecurityKnowledgeBase() {
  const [activeTab, setActiveTab] = useState('vulnerabilities');

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page Header */}
      <div
        className="flex-shrink-0 px-6 py-4 border-b"
        style={{
          background: 'var(--cyber-bg-elevated)',
          borderColor: 'var(--cyber-border)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.05))',
              border: '1px solid hsl(var(--primary) / 0.4)',
            }}
          >
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1
              className="text-lg font-bold font-mono tracking-wide"
              style={{ color: 'var(--cyber-text)', textShadow: '0 0 20px rgba(56,189,248,0.2)' }}
            >
              安全知识库
            </h1>
            <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--cyber-text-muted)' }}>
              Golang Security Knowledge Base
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 flex flex-col px-6 pt-5 pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full min-h-0">
          <TabsList
            className="flex-shrink-0 self-start mb-5 gap-1"
            style={{
              background: 'var(--cyber-bg-elevated)',
              border: '1px solid var(--cyber-border)',
            }}
          >
            <TabsTrigger
              value="vulnerabilities"
              className="font-mono text-sm gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
            >
              <Bug className="w-4 h-4" />
              洞察漏洞库
            </TabsTrigger>
            <TabsTrigger
              value="attack-patterns"
              className="font-mono text-sm gap-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
            >
              <Swords className="w-4 h-4" />
              攻击模式库
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vulnerabilities" className="flex-1 min-h-0 mt-0">
            <VulnerabilityList />
          </TabsContent>

          <TabsContent value="attack-patterns" className="flex-1 min-h-0 mt-0">
            <AttackPatternList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
