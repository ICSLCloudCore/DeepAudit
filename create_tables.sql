-- 创建 agents 表
CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    agent_type VARCHAR(50) NOT NULL DEFAULT 'custom',
    version VARCHAR(20) DEFAULT '1.0.0',
    description TEXT,
    author VARCHAR(255),
    config JSON,
    tools JSON,
    is_system BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(36) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ix_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS ix_agents_is_active ON agents(is_active);

-- 创建 opencode_skills 表
CREATE TABLE IF NOT EXISTS opencode_skills (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0',
    description TEXT,
    author VARCHAR(255),
    category VARCHAR(100) DEFAULT 'custom',
    file_path VARCHAR(500),
    file_size BIGINT,
    checksum VARCHAR(64),
    config JSON,
    schema JSON,
    tags JSON,
    is_public BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(36) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ix_opencode_skills_name ON opencode_skills(name);
CREATE INDEX IF NOT EXISTS ix_opencode_skills_category ON opencode_skills(category);
CREATE INDEX IF NOT EXISTS ix_opencode_skills_is_active ON opencode_skills(is_active);

-- 创建 opencode_mcps 表
CREATE TABLE IF NOT EXISTS opencode_mcps (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0',
    description TEXT,
    author VARCHAR(255),
    mcp_type VARCHAR(50) NOT NULL DEFAULT 'stdio',
    server_url VARCHAR(500),
    command TEXT,
    args JSON,
    env JSON,
    config JSON,
    tools JSON,
    tags JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(36) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ix_opencode_mcps_name ON opencode_mcps(name);
CREATE INDEX IF NOT EXISTS ix_opencode_mcps_mcp_type ON opencode_mcps(mcp_type);
CREATE INDEX IF NOT EXISTS ix_opencode_mcps_is_active ON opencode_mcps(is_active);

-- 创建 project_configs 表
CREATE TABLE IF NOT EXISTS project_configs (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE UNIQUE NOT NULL,
    selected_agents JSON,
    selected_skills JSON,
    selected_mcps JSON,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_project_configs_project_id ON project_configs(project_id);

-- 创建 task_executions 表
CREATE TABLE IF NOT EXISTS task_executions (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) REFERENCES agent_tasks(id) ON DELETE CASCADE UNIQUE NOT NULL,
    opencode_process_id VARCHAR(36),
    opencode_status VARCHAR(20) DEFAULT 'pending',
    process_info JSON,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_task_executions_task_id ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS ix_task_executions_opencode_status ON task_executions(opencode_status);

-- 创建 audit_vulnerabilities 表
CREATE TABLE IF NOT EXISTS audit_vulnerabilities (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    vuln_id VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    cvss_score FLOAT,
    cvss_vector VARCHAR(255),
    cwe VARCHAR(255),
    confidence VARCHAR(20),
    location VARCHAR(255),
    file_path VARCHAR(500),
    line_start INTEGER,
    line_end INTEGER,
    vulnerability_title VARCHAR(255) NOT NULL,
    vulnerability_essence TEXT,
    root_cause TEXT,
    security_impact TEXT,
    vulnerable_code TEXT,
    dataflow TEXT,
    exploit_steps TEXT,
    exploit_poc TEXT,
    impact_confidentiality VARCHAR(20),
    impact_integrity VARCHAR(20),
    impact_availability VARCHAR(20),
    fix_description TEXT,
    fix_code_before TEXT,
    fix_code_after TEXT,
    manual_confirmation BOOLEAN,
    manual_confirmation_status VARCHAR(20) DEFAULT '待确认',
    manual_confirmation_notes TEXT,
    confirmed_by VARCHAR(36),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'new',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_vulnerabilities_task_id ON audit_vulnerabilities(task_id);
CREATE INDEX IF NOT EXISTS ix_audit_vulnerabilities_severity ON audit_vulnerabilities(severity);
CREATE INDEX IF NOT EXISTS ix_audit_vulnerabilities_status ON audit_vulnerabilities(status);
