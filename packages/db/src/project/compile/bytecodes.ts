import { logger } from "@truffle/db/logger";
const debug = logger("db:loaders:commands:compile:bytecodes");

import { IdObject } from "@truffle/db/meta";
import { Process, resources } from "@truffle/db/project/process";
import { PrepareBatch, _, Replace } from "@truffle/db/loaders/batch";

interface Contract {
  bytecode: DataModel.BytecodeInput;
  deployedBytecode: DataModel.BytecodeInput;

  abi: any;
  contractName: any;
  ast: any;
  sourcePath: any;
  source: any;
  sourceMap: any;
  deployedSourceMap: any;

  db?: any;
}

interface Compilation {
  compiler: any;
  sourceIndexes: any;
  contracts: Contract[];
}

export function* generateCompilationsBytecodesLoad(
  compilations: Compilation[]
): Process<
  Replace<
    Compilation,
    {
      contracts: (Contract & {
        db: {
          createBytecode: IdObject<DataModel.Bytecode>;
          callBytecode: IdObject<DataModel.Bytecode>;
        };
      })[];
    }
  >[]
> {
  const { batch, unbatch } = prepareBytecodesBatch(compilations);

  const bytecodes = yield* resources.load("bytecodes", batch);

  return unbatch(bytecodes);
}

const prepareBytecodesBatch: PrepareBatch<
  Replace<Compilation, { contracts: _[] }>[],
  Contract,
  Contract & {
    db: {
      createBytecode: IdObject<DataModel.Bytecode>;
      callBytecode: IdObject<DataModel.Bytecode>;
    };
  },
  DataModel.BytecodeInput,
  IdObject<DataModel.Bytecode>
> = structured => {
  const batch = [];
  const breadcrumbs: {
    [index: number]: {
      compilationIndex: number;
      contractIndex: number;
      bytecodeField: "bytecode" | "deployedBytecode";
    };
  } = {};

  for (const [compilationIndex, { contracts }] of structured.entries()) {
    for (const [contractIndex, contract] of contracts.entries()) {
      for (const bytecodeField of ["bytecode", "deployedBytecode"] as const) {
        breadcrumbs[batch.length] = {
          contractIndex,
          compilationIndex,
          bytecodeField
        };

        batch.push(contract[bytecodeField]);
      }
    }
  }

  const unbatch = (results: IdObject<DataModel.Bytecode>[]) => {
    const compilations = [];

    for (const [index, result] of results.entries()) {
      const { compilationIndex, contractIndex, bytecodeField } = breadcrumbs[
        index
      ];

      if (!compilations[compilationIndex]) {
        compilations[compilationIndex] = {
          ...structured[compilationIndex],
          contracts: []
        };
      }

      // we'll be mutating this
      const compilation = compilations[compilationIndex];

      if (!compilation.contracts[contractIndex]) {
        compilation.contracts[contractIndex] = {
          ...structured[compilationIndex].contracts[contractIndex],
          db: structured[compilationIndex].contracts[contractIndex].db || {}
        };
      }

      // and mutating this
      const contract = compilation.contracts[contractIndex];

      contract.db[
        bytecodeField === "bytecode" ? "createBytecode" : "callBytecode"
      ] = result;
    }

    return compilations;
  };

  return { batch, unbatch };
};