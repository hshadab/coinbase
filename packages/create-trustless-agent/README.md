# create-trustless-agent

Scaffold a new Trustless AgentKit project in seconds.

## Usage

```bash
npx create-trustless-agent my-agent
cd my-agent
npm install
npm run dev
```

## What You Get

```
my-agent/
├── package.json       # Dependencies pre-configured
├── tsconfig.json      # TypeScript config
├── src/
│   └── index.ts       # Working agent with verifiable actions
├── .gitignore
└── README.md
```

## Features

- **Verifiable Actions**: All agent actions wrapped with zkML proofs
- **Verifiable Memory**: Tamper-proof storage for agent interactions
- **TypeScript**: Full type safety out of the box
- **Ready to Run**: `npm run dev` starts immediately

## Learn More

- [Trustless AgentKit](https://github.com/hshadab/coinbase)
- [AgentKit Docs](https://docs.cdp.coinbase.com/agent-kit/welcome)

## License

MIT
