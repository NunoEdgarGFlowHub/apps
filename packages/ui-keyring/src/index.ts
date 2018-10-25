// Copyright 2017-2018 @polkadot/ui-keyring authors & contributors
// This software may be modified and distributed under the terms
// of the ISC license. See the LICENSE file for details.

import { KeyringPair, KeyringPair$Meta, KeyringPair$Json } from '@polkadot/keyring/types';
import { SingleAddress } from './observable/types';
import { KeyringAddress, KeyringInstance, KeyringJson, KeyringJson$Meta, State } from './types';
import { KeyringOptions, KeyringSectionOption, KeyringSectionOptions } from './options/types';

import { BehaviorSubject } from 'rxjs';
import store from 'store';
import { assert, hexToU8a, isHex, isString } from '@polkadot/util';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import testKeyring from '@polkadot/keyring/testing';
import createPair from '@polkadot/keyring/pair';

import observableAll from './observable';
import observableAccounts from './observable/accounts';
import observableAddresses from './observable/addresses';
import observableDevelopment from './observable/development';
import { accountKey, accountRegex, addressKey, addressRegex, MAX_PASS_LEN } from './defaults';

let singletonInstance: Keyring | null = null;

class Keyring implements KeyringInstance {
  private state: State;
  private emptyOptions (): KeyringOptions {
    return {
      account: [],
      address: [],
      all: [],
      recent: [],
      testing: []
    };
  }
  private id: number = 0;
  private optionsSubject: BehaviorSubject<KeyringOptions> = new BehaviorSubject(this.emptyOptions());

  static counter: number;
  static hasCalledInitOptions: boolean = false;

  constructor () {
    // state must be always defined in the constructor even if trying to create second instance to overcome TSLint error
    this.state = {
      accounts: observableAccounts,
      addresses: observableAddresses,
      keyring: testKeyring()
    };

    if (!singletonInstance) {
      singletonInstance = this;
    } else {
      return;
    }

    this.loadAll();

    this.id = ++Keyring.counter;
    assert(this.id <= 1, 'KeyringInstance should be singleton');

    return singletonInstance;
  }

  addAccounts (options: KeyringOptions): void {
    const available = this.state.accounts.subject.getValue();

    Object
      .keys(available)
      .map((address) =>
        available[address]
      )
      .forEach(({ json: { meta: { isTesting = false } }, option }: SingleAddress) => {
        if (!isTesting) {
          options.account.push(option);
        } else {
          options.testing.push(option);
        }
      });
  }

  addAddresses (options: KeyringOptions): void {
    const available = this.state.addresses.subject.getValue();

    Object
      .keys(available)
      .map((address) =>
        available[address]
      )
      .forEach(({ json: { meta: { isRecent = false } }, option }: SingleAddress) => {
        if (isRecent) {
          options.recent.push(option);
        } else {
          options.address.push(option);
        }
      });
  }

  addPair (json: KeyringPair$Json): void {
    const { accounts, keyring } = this.state;

    if (!json.meta.whenCreated) {
      json.meta.whenCreated = Date.now();
    }

    keyring.addFromJson(json);
    accounts.add(json.address, json);
  }

  addPairs (): void {
    const { accounts, keyring } = this.state;

    keyring
      .getPairs()
      .forEach((pair) => {
        const address = pair.address();

        accounts.add(address, {
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

  createAccount (seed: Uint8Array, password?: string, meta: KeyringPair$Meta = {}): KeyringPair {
    const pair = this.state.keyring.addFromSeed(seed, meta);

    this.saveAccount(pair, password);

    return pair;
  }

  createAccountMnemonic (seed: string, password?: string, meta: KeyringPair$Meta = {}): KeyringPair {
    const pair = this.state.keyring.addFromMnemonic(seed, meta);

    this.saveAccount(pair, password);

    return pair;
  }

  createOptionHeader (name: string): KeyringSectionOption {
    return {
      className: 'header disabled',
      name,
      key: `header-${name.toLowerCase()}`,
      text: name,
      value: null
    };
  }

  encryptAccount (pair: KeyringPair, password: string): void {
    const { accounts, keyring } = this.state;
    const json = pair.toJson(password);

    json.meta.whenEdited = Date.now();

    keyring.addFromJson(json);
    accounts.add(json.address, json);
  }

  forgetAccount (address: string): void {
    const { accounts, keyring } = this.state;

    keyring.removePair(address);
    accounts.remove(address);
  }

  forgetAddress (address: string): void {
    this.state.addresses.remove(address);
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
    const { accounts, addresses } = this.state;

    const address = isString(_address)
      ? _address
      : encodeAddress(_address);
    const publicKey = decodeAddress(address);
    const subject = type === 'account'
      ? accounts.subject
      : addresses.subject;

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
      observableDevelopment.isDevelopment() || pair.getMeta().isTesting !== true
    );
  }

  initOptions (): void {
    if (Keyring.hasCalledInitOptions) {
      console.warn('Unable to initialise Keyring options more than once');
      return;
    }

    observableAll.subscribe((value) => {
      const options = this.emptyOptions();

      this.addAccounts(options);
      this.addAddresses(options);

      options.address = ([] as KeyringSectionOptions).concat(
        options.address.length ? [ this.createOptionHeader('Addresses') ] : [],
        options.address,
        options.recent.length ? [ this.createOptionHeader('Recent') ] : [],
        options.recent
      );

      options.account = ([] as KeyringSectionOptions).concat(
        options.account.length ? [ this.createOptionHeader('Accounts') ] : [],
        options.account,
        options.testing.length ? [ this.createOptionHeader('Development') ] : [],
        options.testing
      );

      options.all = ([] as KeyringSectionOptions).concat(
        options.account,
        options.address
      );

      this.optionsSubject.next(options);

      Keyring.hasCalledInitOptions = true;
    });
  }

  isAvailable (_address: Uint8Array | string): boolean {
    const { accounts, addresses } = this.state;

    const accountsSubject = accounts.subject.getValue();
    const addressesSubject = addresses.subject.getValue();

    const address = isString(_address)
      ? _address
      : encodeAddress(_address);

    return !accountsSubject[address] && !addressesSubject[address];
  }

  isPassValid (password: string): boolean {
    return password.length > 0 && password.length <= MAX_PASS_LEN;
  }

  loadAll (): void {
    const { accounts, addresses, keyring } = this.state;

    this.addPairs();

    store.each((json: KeyringJson, key: string) => {
      if (accountRegex.test(key)) {
        if (!json.meta.isTesting && (json as KeyringPair$Json).encoded) {
          const pair = keyring.addFromJson(json as KeyringPair$Json);

          accounts.add(pair.address(), json);
        }

        const [, hexAddr] = key.split(':');

        if (hexAddr.substr(0, 2) !== '0x') {
          store.remove(key);
          store.set(accountKey(hexAddr), json);
        }
      } else if (addressRegex.test(key)) {
        const address = encodeAddress(
          isHex(json.address)
            ? hexToU8a(json.address)
            : decodeAddress(json.address)
        );
        const [, hexAddr] = key.split(':');

        addresses.add(address, json);

        if (hexAddr.substr(0, 2) !== '0x') {
          store.remove(key);
          store.set(addressKey(hexAddr), json);
        }
      }
    });

    this.initOptions();
  }

  restoreAccount (json: KeyringPair$Json, password: string): KeyringPair {
    const { keyring } = this.state;

    const pair = createPair(
      {
        publicKey: decodeAddress(json.address),
        secretKey: new Uint8Array()
      },
      json.meta,
      hexToU8a(json.encoded)
    );

    // unlock, save account and then lock (locking cleans secretKey, so needs to be last)
    pair.decodePkcs8(password);
    keyring.addPair(pair);
    this.addPair(json);
    pair.lock();

    return pair;
  }

  saveAccount (pair: KeyringPair, password?: string): void {
    const { accounts, keyring } = this.state;

    const json = pair.toJson(password);

    if (!json.meta.whenCreated) {
      json.meta.whenCreated = Date.now();
    }

    keyring.addFromJson(json);
    accounts.add(json.address, json);
  }

  saveAccountMeta (pair: KeyringPair, meta: KeyringPair$Meta): void {
    const address = pair.address();
    const json = store.get(accountKey(address));

    pair.setMeta(meta);
    json.meta = pair.getMeta();

    this.state.accounts.add(json.address, json);
  }

  saveAddressMeta (address: string, meta: KeyringPair$Meta): void {
    const { addresses } = this.state;

    const available = addresses.subject.getValue();

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

    addresses.add(address, json);
  }

  saveRecent (address: string): SingleAddress {
    const { addresses } = this.state;

    const available = addresses.subject.getValue();

    if (!available[address]) {
      const json = {
        address,
        meta: {
          isRecent: true,
          whenCreated: Date.now()
        }
      };

      addresses.add(address, (json as KeyringJson));
    }

    return addresses.subject.getValue()[address];
  }

  setDevMode (isDevelopment: boolean): void {
    return observableDevelopment.set(isDevelopment);
  }
}

Keyring.counter = 0;

export {
  Keyring
};

const keyringInstance = new Keyring();

export default keyringInstance;
