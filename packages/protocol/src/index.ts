export type ProtocolContract = {
    [discriminator: string]: {
        request?: any;
        response?: any;
    };
};

export type ProtocolRequest<ContractT extends ProtocolContract, TypeT extends keyof ContractT> = {
    type: TypeT;
} & ContractT[TypeT]["request"];

export type AnyProtocolRequest<ContractT extends ProtocolContract> = ProtocolRequest<ContractT, keyof ContractT>;

export type ProtocolResponse<
    ContractT extends ProtocolContract,
    TypeT extends keyof ContractT,
> = ContractT[TypeT]["response"] extends object ? ContractT[TypeT]["response"] : void;

export type AnyProtocolResponse<ContractT extends ProtocolContract> = ProtocolResponse<ContractT, keyof ContractT>;

export type ProtocolRequestSyncImplementation<ContractT extends ProtocolContract, TypeT extends keyof ContractT> = (
    request: ProtocolRequest<ContractT, TypeT>,
) => ProtocolResponse<ContractT, TypeT>;

export type ProtocolSyncImplementationMap<ContractT extends ProtocolContract> = {
    [TypeT in keyof ContractT]: ProtocolRequestSyncImplementation<ContractT, TypeT>;
};

export type ProtocolRequestAsyncImplementation<ContractT extends ProtocolContract, TypeT extends keyof ContractT> = (
    request: ProtocolRequest<ContractT, TypeT>,
) => ProtocolResponse<ContractT, TypeT> | Promise<ProtocolResponse<ContractT, TypeT>>;

export type ProtocolAsyncImplementationMap<ContractT extends ProtocolContract> = {
    [TypeT in keyof ContractT]: ProtocolRequestAsyncImplementation<ContractT, TypeT>;
};

export function processRequestByProtocolImplementationMap<ContractT extends ProtocolContract>(
    request: unknown,
    implementationMap: ProtocolSyncImplementationMap<ContractT>,
): AnyProtocolResponse<ContractT>;
export function processRequestByProtocolImplementationMap<ContractT extends ProtocolContract>(
    request: unknown,
    implementationMap: ProtocolAsyncImplementationMap<ContractT>,
): Promise<AnyProtocolResponse<ContractT>>;
export function processRequestByProtocolImplementationMap<ContractT extends ProtocolContract>(
    request: AnyProtocolRequest<ContractT>,
    implementationMap: ProtocolSyncImplementationMap<ContractT>,
): AnyProtocolResponse<ContractT> | Promise<AnyProtocolResponse<ContractT>> {
    const implementation = implementationMap[request.type];
    if (!implementation) {
        throw new ProtocolUnknownRequest(`Unknown request type: ${request.type}`);
    }
    return implementation(request);
}

export class ProtocolUnknownRequest extends Error {}
