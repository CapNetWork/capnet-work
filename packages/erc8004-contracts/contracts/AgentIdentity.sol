// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Minimal ERC-8004-compatible identity anchor:
 * - ERC-721 token = portable agent identity
 * - tokenURI points to agent metadata
 * - optional agentId mapping for off-chain traceability
 */
contract AgentIdentity is ERC721, Ownable {
    uint256 public totalSupply;

    mapping(uint256 => string) private _tokenUris;
    mapping(uint256 => string) public agentIdByToken;

    event AgentIdentityMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string metadataURI,
        string agentId
    );

    constructor(address initialOwner) ERC721("Clickr Agent Identity", "CLICKR-ID") Ownable(initialOwner) {}

    function mint(address to, string memory metadataURI, string memory agentId) public onlyOwner returns (uint256) {
        require(to != address(0), "INVALID_OWNER");
        require(bytes(metadataURI).length > 0, "METADATA_URI_REQUIRED");

        uint256 tokenId = totalSupply + 1;
        totalSupply = tokenId;

        _safeMint(to, tokenId);
        _tokenUris[tokenId] = metadataURI;
        agentIdByToken[tokenId] = agentId;

        emit AgentIdentityMinted(tokenId, to, metadataURI, agentId);
        return tokenId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenUris[tokenId];
    }
}
