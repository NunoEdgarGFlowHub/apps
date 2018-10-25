// Copyright 2017-2018 @polkadot/ui-keyring authors & contributors
// This software may be modified and distributed under the terms
// of the ISC license. See the LICENSE file for details.

import { KeyringPair, KeyringPair$Meta, KeyringPair$Json } from '@polkadot/keyring/types';
import { SingleAddress } from './observable/types';
import { KeyringAddress, KeyringInstance, KeyringJson, KeyringJson$Meta, State } from './types';

import store from 'store';
import { hexToU8a, isHex, isString } from '@polkadot/util';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import testKeyring from '@polkadot/keyring/testing';
import createPair from '@polkadot/keyring/pair';

import accounts from './observable/accounts';
import addresses from './observable/addresses';
import development from './observable/development';
import isAvailable from './isAvailable';
import isPassValid from './isPassValid';
import createAccountMnemonic from './account/mnemonic';
import encryptAccount from './account/encrypt';
import { accountKey, accountRegex, addressRegex } from './defaults';
import initOptions from './options';

class Keyring implements KeyringInstance {
  private state: State;

  constructor () {
    this.state = {
      accounts,
      addresses,
      keyring: testKeyring()
    };

    // NOTE Everything is loaded in API after chain is received
    this.loadAll();
  }

  addPair (json: KeyringPair$Json): void {
    if (!json.meta.whenCreated) {
      json.meta.whenCreated = Date.now();
    }

    this.state.keyring.addFromJson(json);
    this.state.accounts.add(json.address, json);
  }

  addPairs (): void {
    this.state.keyring
      .getPairs()
      .forEach((pair) => {
        const address = pair.address();

        this.state.accounts.add(address, {
          address,
          meta: pair.getMeta()
        });
      });
  }

  backupAccount (pair: KeyringPair, password: string): KeyringPair$Json {
    if (!pair.isLocked()) {
      pair.lock();
    }

    pair.decodePkcs8(password);

    return pair.toJson(password);
  }

  createAccount (seed: Uint8Array, password?: string, meta?: KeyringPair$Meta): KeyringPair {
    const pair = this.state.keyring.addFromSeed(seed, meta);

    this.saveAccount(pair, password);

    return pair;
  }

  createAccountMnemonic (seed: string, password?: string, meta?: KeyringPair$Meta): KeyringPair {
    return createAccountMnemonic(this.state, seed, password, meta);
  }

  encryptAccount (pair: KeyringPair, password: string): void {
    return encryptAccount(this.state, pair, password);
  }

  forgetAccount (address: string): void {
    this.state.keyring.removePair(address);
    this.state.accounts.remove(address);
  }

  forgetAddress (address: string): void {
    this.state.addresses.remove(address);
  }

  isAvailable (address: string | Uint8Array): boolean {
    return isAvailable(this.state, address);
  }

  isPassValid (password: string): boolean {
    return isPassValid(this.state, password);
  }

  getAccounts (): Array<KeyringAddress> {
    const available = this.state.accounts.subject.getValue();

    return Object
      .keys(available)
      .map((address) =>
        this.getAddress(address, 'account')
      )
      .filter((account) =>
        !account.getMeta().isTesting
      );
  }

  getAddress (_address: string | Uint8Array, type: 'account' | 'address' = 'address'): KeyringAddress {
    const address = isString(_address)
      ? _address
      : encodeAddress(_address);
    const publicKey = decodeAddress(address);
    const subject = type === 'account'
      ? this.state.accounts.subject
      : this.state.addresses.subject;

    return {
      address: (): string =>
        address,
      isValid: (): boolean =>
        !!subject.getValue()[address],
      publicKey: (): Uint8Array =>
        publicKey,
      getMeta: (): KeyringJson$Meta =>
        subject.getValue()[address].json.meta
    };
  }

  getAddresses (): Array<KeyringAddress> {
    const available = this.state.addresses.subject.getValue();

    return Object
      .keys(available)
      .map((address) =>
        this.getAddress(address)
      );
  }

  getPair (address: string | Uint8Array): KeyringPair {
    return this.state.keyring.getPair(address);
  }

  getPairs (): Array<KeyringPair> {
    return this.state.keyring.getPairs().filter((pair) =>
      development.isDevelopment() || pair.getMeta().isTesting !== true
    );
  }

  loadAll (): void {
    const { accounts, addresses, keyring } = this.state;

    this.addPairs();

    store.each((json: KeyringJson, key: string) => {
      if (accountRegex.test(key)) {
        if (!json.meta || !json.meta.isTesting) {
          keyring.addFromJson(json as KeyringPair$Json);
          accounts.add(json.address, json);
        }
      } else if (addressRegex.test(key)) {
        const address = isHex(json.address)
          ? encodeAddress(hexToU8a(json.address))
          : json.address;

        // NOTE This is a fix for an older version where publicKeys instead of addresses
        // were saved. Here we clean the old and replace with a new address-specific key
        if (address !== json.address) {
          json.address = address;

          store.remove(key);
          this.saveAddressMeta(address, json.meta);
        }

        addresses.add(json.address, json);
      }
    });

    // TODO - refactor initOptions into this Keyring class file?
    initOptions(this.state);
  }

  restoreAccount (json: KeyringPair$Json, password: string): KeyringPair {
    const pair = createPair(
      {
        publicKey: decodeAddress(json.address),
        secretKey: new Uint8Array()
      },
      json.meta,
      hexToU8a(json.encoded)
    );

    pair.decodePkcs8(password);
    this.state.keyring.addPair(pair);
    this.addPair(json);
    pair.lock();

    return pair;
  }

  saveAccount (pair: KeyringPair, password?: string): void {
    const json = pair.toJson(password);

    if (!json.meta.whenCreated) {
      json.meta.whenCreated = Date.now();
    }

    this.state.keyring.addFromJson(json);
    this.state.accounts.add(json.address, json);
  }

  saveAccountMeta (pair: KeyringPair, meta: KeyringPair$Meta): void {
    const address = pair.address();
    const json = store.get(accountKey(address));

    pair.setMeta(meta);
    json.meta = pair.getMeta();

    this.state.accounts.add(json.address, json);
  }

  saveAddressMeta (address: string, meta: KeyringPair$Meta): void {
    const available = this.state.addresses.subject.getValue();

    const json = (available[address] && available[address].json) || {
      address,
      meta: {
        isRecent: void 0,
        whenCreated: Date.now()
      }
    };

    Object.keys(meta).forEach((key) => {
      json.meta[key] = meta[key];
    });

    delete json.meta.isRecent;

    this.state.addresses.add(address, json);
  }

  saveRecent (address: string): SingleAddress {
    const available = this.state.addresses.subject.getValue();

    if (!available[address]) {
      const json = {
        address,
        meta: {
          isRecent: true,
          whenCreated: Date.now()
        }
      };

      this.state.addresses.add(address, (json as KeyringJson));
    }

    return this.state.addresses.subject.getValue()[address];
  }

  setDevMode (isDevelopment: boolean): void {
    return development.set(isDevelopment);
  }
}

const keyringInstance = new Keyring();

export default keyringInstance;
