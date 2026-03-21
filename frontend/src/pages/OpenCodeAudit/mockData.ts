/**
 * OpenCode 审计消息模拟数据
 * 用于测试新组件
 */

import type { OpenCodeMessage } from './messageTypes';

export const mockMessages: OpenCodeMessage[] = [
  {
    info: {
      role: 'user',
      time: {
        created: 1774060427792,
      },
      id: 'msg_oqwNoamg0sYg7FiNxwDQbhtCXN',
      sessionID: 'ses_2f1c22837ffe2IrHzihY8XrN77',
      agent: 'build',
    },
    parts: [
      {
        type: 'text',
        text: '启动代码审计',
        id: 'prt_d0e3dda15001932FClerO0QMTU',
        sessionID: 'ses_2f1c22837ffe2IrHzihY8XrN77',
        messageID: 'msg_oqwNoamg0sYg7FiNxwDQbhtCXN',
      },
    ],
  },
  {
    info: {
      role: 'assistant',
      time: {
        created: 1774060427821,
        completed: 1774060451033,
      },
      id: 'msg_d0e3dda2d001l1V3A5b001u5QC',
      sessionID: 'ses_2f1c22837ffe2IrHzihY8XrN77',
      parentID: 'msg_oqwNoamg0sYg7FiNxwDQbhtCXN',
      modelID: 'Doubao-Seed-2.0-Code',
      providerID: 'llt',
      agent: 'build',
      cost: 0,
      tokens: {
        total: 11712,
        input: 11573,
        output: 139,
        reasoning: 88,
        cache: {
          read: 0,
          write: 0,
        },
      },
      finish: 'tool-calls',
    },
    parts: [
      {
        type: 'step-start',
        id: 'prt_d0e3e2c44001YP6GSy0S9tQsAe',
        sessionID: 'ses_2f1c22837ffe2IrHzihY8XrN77',
        messageID: 'msg_d0e3dda2d001l1V3A5b001u5QC',
      },
      {
        type: 'reasoning',
        text: '用户要求启动代码审计。根据提供的技能列表，我看到有一个专门的"go-audit"技能，用于全面的Go代码安全审计。用户说的是"启动代码审计"，但没有明确指定是哪种语言，不过根据技能描述，go-audit是专门针对Go项目的。\n\n我应该先使用skill工具加载go-audit技能，然后根据技能的指导进行审计。',
        time: {
          start: 1774060448842,
          end: 1774060451001,
        },
        id: 'prt_d0e3e2c4a001CyIPEHNXjVC2Qt',
        sessionID: 'ses_2f1c22837ffe2IrHzihY8XrN77',
        messageID: 'msg_d0e3dda2d001l1V3A5b001u5QC',
      },
      {
        type: 'text',
        text: '我来帮你启动代码审计。首先让我加载Go代码安全审计技能。',
        time: {
          start: 1774060451004,
          end: 1774060451004,
        },
        id: 'prt_d0e3e31b9001VG1sB97vDhwwFf',
        sessionID: 'ses_2f1c22837ffe2IrHzihY8XrN77',
        messageID: 'msg_d0e3dda2d001l1V3A5b001u5QC',
      },
      {
        type: 'tool',
        callID: 'call_jqjvmx8rlq55ye74mtwy2xn6',
        tool: 'skill',
        id: 'prt_d0e3e3434001Af8AmdPgE6ZLhN',
        sessionID: 'ses_2f1c22837ffe2IrHzihY8XrN77',
        messageID: 'msg_d0e3dda2d001l1V3A5b001u5QC',
        state: {
          status: 'completed',
          input: {
            name: 'go-audit',
          },
          output: 'Loaded skill: go-audit',
          title: 'Loaded skill: go-audit',
          metadata: {
            name: 'go-audit',
          },
          time: {
            start: 1774060450891,
            end: 1774060450943,
          },
        },
      },
      {
        type: 'step-finish',
        reason: 'tool-calls',
        cost: 0,
        tokens: {
          total: 11712,
          input: 11573,
          output: 139,
          reasoning: 88,
          cache: {
            read: 0,
            write: 0,
          },
        },
        id: 'prt_d0e3e34c7001t7tIFYH5MN3uoO',
        sessionID: 'ses_2f1c22837ffe2IrHzihY8XrN77',
        messageID: 'msg_d0e3dda2d001l1V3A5b001u5QC',
      },
    ],
  },
];
