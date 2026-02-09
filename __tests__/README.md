# oh-my-claude-webui BDD 测试体系

## 核心原则

BDD（行为驱动开发）关注验证需求，而非实现细节。测试描述的是**行为**，代码只是实现行为的赠品。

## 测试命名规范

**BDD 风格（推荐）**:

传统单元测试（关注实现）：
```typescript
test('setSelectedProject updates state', () => {...})
```

BDD 风格（关注行为）：
```typescript
test('should display project sessions when user selects a project', () => {...})
test('should sync file explorer when project changes', () => {...})
```

## 运行测试

```bash
# 运行所有测试
bun test

# 运行特定功能测试
bun test --grep "File Explorer"

# 生成覆盖率报告
bun run test:coverage
```
