import { IPalAssetDto } from 'pal-public-types-lib';
import { IPalAssetRepository } from '../../src';

export class MockAssetRepo implements IPalAssetRepository {
  private _data: Map<string, IPalAssetDto> = new Map<string, IPalAssetDto>();

  store(asset: IPalAssetDto): Promise<IPalAssetDto> {
    this._data.set(asset.code, asset);
    return Promise.resolve(asset);
  }

  fetch(codes?: string[]): Promise<IPalAssetDto[]> {
    if (!codes || codes.length === 0) {
      return Promise.resolve([...this._data.values()]);
    }

    return Promise.resolve(
      codes
        .map((code) => this._data.get(code) ?? null)
        .filter((asset) => asset !== null)
    );
  }
}
