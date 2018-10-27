// Copyright 2017-2018 @polkadot/ui-keyring authors & contributors
// This software may be modified and distributed under the terms
// of the ISC license. See the LICENSE file for details.

import { KeyringPair, KeyringPair$Meta, KeyringPair$Json } from '@polkadot/keyring/types';
import { SingleAddress } from './observable/types';
import { KeyringAddress, KeyringInstance, State } from './types';

import accounts from './observable/accounts';
import addresses from './observable/addresses';
import development from './observable/development';
import loadAll from './loadAll';
import addAccountPair from './account/addPair';
import backupAccount from './account/backup';
import createAccount from './account/create';
import forgetAccount from './account/forget';
import createAccountMnemonic from './account/mnemonic';
import restoreAccount from './account/restore';
import isAvailable from './isAvailable';
import isPassValid from './isPassValid';
import encryptAccount from './account/encrypt';
import saveAccount from './account/save';
import saveAccountMeta from './account/meta';
import forgetAddress from './address/forget';
import getAccounts from './account/all';
import getAddress from './address/get';
import getAddresses from './address/all';
import saveAddress from './address/meta';
import saveRecent from './address/metaRecent';

const state: State = {
  accounts,
  addresses
} as State;

// NOTE Everything is loaded in API after chain is received
// loadAll(state);

// FIXME The quicker we get in https://github.com/polkadot-js/apps/issues/138
// the better, this is now completely out of control
function keyringInstance (): KeyringInstance {
  return {
    addAccountPair: (pair: KeyringPair, password: string): KeyringPair =>
      addAccountPair(state, pair, password),
    backupAccount: (pair: KeyringPair, password: string): KeyringPair$Json =>
      backupAccount(state, pair, password),
    createAccount: (seed: Uint8Array, password?: string, meta?: KeyringPair$Meta): KeyringPair =>
      createAccount(state, seed, password, meta),
    createAccountMnemonic: (seed: string, password?: string, meta?: KeyringPair$Meta): KeyringPair =>
      createAccountMnemonic(state, seed, password, meta),
    encryptAccount: (pair: KeyringPair, password: string): void =>
      encryptAccount(state, pair, password),
    forgetAccount: (address: string): void =>
      forgetAccount(state, address),
    forgetAddress: (address: string): void =>
      forgetAddress(state, address),
    isAvailable: (address: string | Uint8Array): boolean =>
      isAvailable(state, address),
    isPassValid: (password: string): boolean =>
      isPassValid(state, password),
    getAccounts: (): Array<KeyringAddress> =>
      getAccounts(state),
    getAddress: (address: string | Uint8Array): KeyringAddress =>
      getAddress(state, address),
    getAddresses: (): Array<KeyringAddress> =>
      getAddresses(state),
    getPair: (address: string | Uint8Array): KeyringPair =>
      state.keyring.getPair(address),
    getPairs: (): Array<KeyringPair> =>
      state.keyring.getPairs().filter((pair) =>
        development.isDevelopment() || pair.getMeta().isTesting !== true
      ),
    loadAll: (): void =>
      loadAll(state),
    restoreAccount: (json: KeyringPair$Json, password: string): KeyringPair =>
      restoreAccount(state, json, password),
    saveAccount: (pair: KeyringPair, password?: string): void =>
      saveAccount(state, pair, password),
    saveAccountMeta: (pair: KeyringPair, meta: KeyringPair$Meta): void =>
      saveAccountMeta(state, pair, meta),
    saveAddress: (address: string, meta: KeyringPair$Meta): void =>
      saveAddress(state, address, meta),
    saveRecent: (address: string): SingleAddress =>
      saveRecent(state, address),
    setDevMode: (isDevelopment: boolean): void =>
      development.set(isDevelopment)
  };
}

const Keyring = keyringInstance();

export default Keyring;
