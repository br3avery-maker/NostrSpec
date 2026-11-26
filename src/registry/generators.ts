import type { OperationContract, OperationParameter } from './operations';

function parameterToJsonSchema(param: OperationParameter): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: param.jsonType,
    description: param.description,
  };
  if (param.jsonType === 'array' && param.itemsType) {
    schema.items =
      param.itemsType === 'array'
        ? { type: 'array', items: { type: 'string' } }
        : { type: param.itemsType };
  }
  if (param.example !== undefined) {
    schema.example = param.example;
  }
  return schema;
}

function buildOperationInputSchema(op: OperationContract): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of op.parameters) {
    properties[param.name] = parameterToJsonSchema(param);
    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function buildOperationOutputSchema(op: OperationContract): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const field of op.returns.fields) {
    properties[field.name] = {
      type: field.jsonType,
      description: field.description,
    };
  }
  return {
    type: 'object',
    description: op.returns.summary,
    properties,
  };
}

/**
 * Generates an OpenAPI 3.1.0 specification directly from the single Operation Registry.
 */
export function generateOpenApiSpec(operations: OperationContract[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const op of operations) {
    const methodKey = op.http.method.toLowerCase();
    const responses: Record<string, unknown> = {
      '200': {
        description: op.returns.summary,
        content: {
          'application/json': {
            schema: buildOperationOutputSchema(op),
          },
        },
      },
    };

    for (const err of op.errors) {
      const codeKey = String(err.httpStatus);
      if (!responses[codeKey]) {
        responses[codeKey] = {
          description: `${err.code}: ${err.condition}`,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: err.code },
                  error: { type: 'string', example: err.condition },
                  recovery: { type: 'string', example: err.recovery },
                },
              },
            },
          },
        };
      }
    }

    paths[op.http.path] = {
      ...(paths[op.http.path] ?? {}),
      [methodKey]: {
        operationId: op.id,
        summary: op.title,
        description: op.summary,
        tags: [op.group],
        'x-nostr-origin': op.origin,
        'x-nostr-nips': op.nips,
        'x-nostr-kinds': op.eventKinds,
        ...(op.http.method === 'POST'
          ? {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: buildOperationInputSchema(op),
                  },
                },
              },
            }
          : {}),
        responses,
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'NostrSpec Operation Registry API',
      version: '1.0.0',
      summary: 'Machine-readable HTTP interface generated directly from NostrSpec NIP & SDK operation contracts.',
    },
    servers: [{ url: 'https://api.nostrspec.example', description: 'Reference HTTP gateway contract' }],
    paths,
  };
}

/**
 * Generates an OpenAPI path snippet for a single operation (for inline docs inspection).
 */
export function generateSingleOperationOpenApi(op: OperationContract): Record<string, unknown> {
  const full = generateOpenApiSpec([op]) as { paths: Record<string, unknown> };
  return full.paths;
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    origin: OperationContract['origin'];
    nips: string[];
    eventKinds: number[];
    sdkModule: string;
  };
}

/**
 * Generates a Model Context Protocol (MCP) tools manifest so agents can execute
 * or implement any documented Nostr operation from one source of truth.
 */
export function generateMcpToolsManifest(operations: OperationContract[]): {
  protocol: string;
  generator: string;
  tools: McpToolDefinition[];
} {
  return {
    protocol: 'mcp/2025-03-26',
    generator: 'nostrspec-operation-registry/1.0.0',
    tools: operations.map((op) => ({
      name: op.mcpToolName,
      title: op.title,
      description: `${op.summary} [NIPs: ${op.nips.map((n) => `NIP-${n}`).join(', ')} | Origin: ${op.origin}]`,
      inputSchema: buildOperationInputSchema(op),
      annotations: {
        origin: op.origin,
        nips: op.nips,
        eventKinds: op.eventKinds,
        sdkModule: `${op.sdkModuleId}.ts`,
      },
    })),
  };
}

/**
 * Generates a ready-to-copy CLI invocation directly from the operation's parameter schema.
 */
export function generateCliInvocation(op: OperationContract): string {
  const flags = op.parameters.map((param) => {
    const flagName = `--${param.name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
    const value =
      typeof param.example === 'string'
        ? JSON.stringify(param.example)
        : typeof param.example === 'number' || typeof param.example === 'boolean'
          ? String(param.example)
          : `'${JSON.stringify(param.example)}'`;
    return `  ${flagName} ${value}`;
  });
  return `${op.cli.command} \\\n${flags.join(' \\\n')}`;
}

/**
 * Generates a curl HTTP request directly from the OpenAPI operation contract.
 */
export function generateHttpRequestExample(op: OperationContract): string {
  const payload: Record<string, unknown> = {};
  for (const param of op.parameters) {
    payload[param.name] = param.example;
  }
  return [
    `curl -X ${op.http.method} "https://api.nostrspec.example${op.http.path}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${JSON.stringify(payload, null, 2)}'`,
  ].join('\n');
}

function toPascalCase(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function mapParamToTsType(param: OperationParameter): string {
  if (param.type.startsWith('Array<') || param.type.startsWith('Record<')) return param.type;
  switch (param.jsonType) {
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'string';
    case 'array':
      return 'unknown[]';
    default:
      return param.type.includes(' ') ? 'Record<string, unknown>' : param.type;
  }
}

/**
 * Generates strongly-typed TypeScript Input/Output interfaces from an operation contract.
 */
export function generateTypeScriptInterface(op: OperationContract): string {
  const baseName = toPascalCase(op.id);
  const inputLines = op.parameters.map(
    (p) => `  /** ${p.description} */\n  ${p.name}${p.required ? '' : '?'}: ${mapParamToTsType(p)};`,
  );
  const outputLines = op.returns.fields.map(
    (f) => `  /** ${f.description} */\n  ${f.name}: ${f.type === 'Boolean' ? 'boolean' : f.type === 'Integer' ? 'number' : f.type === 'String' ? 'string' : f.type};`,
  );

  return [
    `// Generated from NostrSpec Operation Contract: ${op.id}`,
    `// Origin: ${op.origin === 'nip-contract' ? 'Official NIP Contract' : 'SDK Engineering Add-On (not official NIP text)'}`,
    `export interface ${baseName}Input {`,
    ...inputLines,
    '}',
    '',
    `export interface ${baseName}Output {`,
    ...outputLines,
    '}',
  ].join('\n');
}

/**
 * Exports all shared conformance test vectors across all operations in a single JSON suite.
 */
export function generateConformanceSuite(operations: OperationContract[]): {
  suite: string;
  version: string;
  vectorCount: number;
  operations: Array<{
    operationId: string;
    origin: OperationContract['origin'];
    nips: string[];
    vectors: OperationContract['testVectors'];
  }>;
} {
  const grouped = operations.map((op) => ({
    operationId: op.id,
    origin: op.origin,
    nips: op.nips,
    vectors: op.testVectors,
  }));
  const vectorCount = grouped.reduce((sum, item) => sum + item.vectors.length, 0);

  return {
    suite: 'nostrspec-conformance-vectors',
    version: '1.0.0',
    vectorCount,
    operations: grouped,
  };
}
